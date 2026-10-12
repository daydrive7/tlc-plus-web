/* Port of TLC+ v1.3.0 resources/pathTraceService.py (MIT). */
'use strict';
function pathRDP(points,epsilon){
  if(points.length<3)return points.slice();
  // Iterative RDP avoids stack overflow with long GPS recordings.
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
  while(stack.length){
    const [a,b]=stack.pop(),p=points[a],q=points[b],dx=q.x-p.x,dy=q.y-p.y,den=Math.hypot(dx,dy);
    let max=0,index=a;
    for(let i=a+1;i<b;i++){
      const r=points[i],t=den?Math.max(0,Math.min(1,((r.x-p.x)*dx+(r.y-p.y)*dy)/(den*den))):0;
      const dist=Math.hypot(r.x-(p.x+t*dx),r.y-(p.y+t*dy));
      if(dist>max){max=dist;index=i;}
    }
    if(max>epsilon){keep.add(index);stack.push([a,index],[index,b]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
function filterPathNodes(points,minDist,minAngle=8){
  if(points.length<3)return points;
  const spaced=[points[0]];
  for(const p of points.slice(1)){const last=spaced[spaced.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>minDist)spaced.push(p);}
  if(spaced.length<2)return spaced;
  const out=[spaced[0]];
  for(let i=1;i<spaced.length-1;i++){
    const prev=out[out.length-1],curr=spaced[i],next=spaced[i+1];
    let diff=Math.abs(Math.atan2(curr.y-prev.y,curr.x-prev.x)-Math.atan2(next.y-curr.y,next.x-curr.x));
    if(diff>Math.PI)diff=2*Math.PI-diff;
    if(diff>minAngle*Math.PI/180)out.push(curr);
  }
  out.push(spaced[spaced.length-1]);return out;
}
function traceProjectedPath(path,accuracy=50){
  if(!path||path.length<5)throw new Error('Not enough GPS points to trace a layout');
  const detail=Math.max(0,Math.min(1,(Number(accuracy)||50)/50-1));
  const metres=[];
  for(const [x,y] of path){if(!Number.isFinite(x)||!Number.isFinite(y))continue;const prev=metres[metres.length-1];if(!prev||Math.hypot(x-prev.x,-y-prev.y)>=1)metres.push({x,y:-y});}
  if(metres.length<5)throw new Error('Not enough distinct GPS points to trace a layout');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of metres){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
  const bbox=Math.max(maxX-minX,maxY-minY,1);
  let epsilon=bbox*0.01*(1-0.5*detail),simplified=pathRDP(metres,epsilon);
  while(simplified.length>Math.floor(280*(1+detail))&&epsilon<bbox){epsilon*=1.5;simplified=pathRDP(metres,epsilon);}
  let filtered=filterPathNodes(simplified,12*(1-0.5*detail),4*(1-0.5*detail));
  if(filtered.length<3)filtered=filterPathNodes(simplified,10);
  if(filtered.length<2)filtered=simplified.length<=2?simplified:simplified.slice(-2);
  if(filtered.length<2)throw new Error('Trace resulted in too few points');
  const points=filtered.map(p=>makeCoordinate(p.x,p.y,0,40,-1,1));
  const gap=Math.hypot(points[0].x-points[points.length-1].x,points[0].y-points[points.length-1].y);
  const circuit=gap<Math.max(30,bbox*0.02)&&points.length>=3;
  if(circuit&&gap<45){points[points.length-1].x=points[0].x;points[points.length-1].y=points[0].y;}
  return {polygon:points,circuit};
}
async function runGPSTrace(){
  const res=await promptFile('.gpx,.csv',true);if(!res)return;
  try{
    const path=res.name.toLowerCase().endsWith('.gpx')?parseGPX(res.content):parseCSVPath(res.content);
    const result=traceProjectedPath(path,S.traceAccuracy);
    saveToHistory();polygon=result.polygon;S.circuit=result.circuit;decorations=[];selectedDeco=null;selectedPoints=[];
    syncSidebarControls();displayChange();centerOnTrack();toast(tr('Trace complete')+': '+polygon.length+' '+tr('nodes'),'success');
  }catch(e){messageBox(tr('Error'),e.message);}
}
