/* TLC+ v1.3.0 decoration system. Original: daydrive7 / eran0004, MIT. */
'use strict';
let decoType = 1, decoOneSide = false, decoDragging = false, decoDragSaved = false;
const DECO_TRACK_OFFSET = {CURB:0.5, A:0.75, AB:1.35, B:2.2};
function decoScenery(index) { return DECORATION_CATALOG[index] || DECORATION_CATALOG[2]; }
function decorationVariants(index, type, side, track) {
  const sc = decoScenery(index), si = side === 'right' ? 1 : 0;
  const code = {CURB:1,A:2,B:3,AB:4}[track] || 4;
  const excluded = [sc.cliff_left[0],sc.cliff_left[2],sc.cliff_right[0],sc.cliff_right[2]];
  const pool = sc.variants.filter(v => v.type === type && !excluded.includes(v.uuid));
  const exact = pool.filter(v => v.disp[si] === code);
  return exact.length ? exact : pool;
}
function decorationVariant(deco, index) {
  for (const sc of [decoScenery(index), ...Object.values(DECORATION_CATALOG)]) {
    const v = sc.variants.find(v => v.uuid === String(deco.uuid)); if (v) return v;
  }
  return {type:deco.type,uuid:String(deco.uuid),len:deco.length || 50,rot:[0,0],disp:[0,0]};
}
function decorationTracktype(track, side) {
  const code = {CURB:1,A:2,B:3,AB:4}[track] || 4, si = side === 'right' ? 1 : 0;
  return code >= 2 ? code-2+si*3 : 6+si;
}
function constructDecorations(banks, state, items) {
  items = items || decorations;
  const entries = [], sc = decoScenery(state.sceneryindex);
  for (const d of [...items].sort((a,b) => a.vpos-b.vpos)) {
    const v = decorationVariant(d,state.sceneryindex), len = d.length || v.len || 50;
    const rotation = d.rotation === undefined ? v.rot[d.side === 'right' ? 1 : 0] : d.rotation;
    const begin = d.vpos-len/2;
    if (begin < 0) continue; // Same boundary rule as the official editor.
    const tracktype = decorationTracktype(d.track,d.side);
    const chain = [sc.cliff_left,sc.cliff_right].find(c => c[1] !== '0' && c[1] === v.uuid);
    function emit(uuid, a, b) {
      entries.push({uuid,rotation,tracktype,vposIncludeHeight:distToIncludeHeight(banks,a),vposIncludeHeight2:distToIncludeHeight(banks,b)});
    }
    if (chain) {
      let pos = begin;
      for (let i=0;i<3;i++) {
        const span = len*(i === 1 ? 0.5 : 0.25);
        emit(chain[rotation & 1 ? 2-i : i],pos,pos+span); pos += span;
      }
    } else emit(v.uuid,begin,begin+len);
  }
  return entries;
}
function importDecorations(ted) {
  const index = ted.header.sceneryindex[3], sc = decoScenery(index);
  const items = ted.decorations.map(d => ({
    begin:d.vposExcludeHeight === undefined ? d.vposIncludeHeight : d.vposExcludeHeight,
    end:d.vposExcludeHeight2 === undefined ? d.vposIncludeHeight2 : d.vposExcludeHeight2,
    uuid:String(d.uuid), rotation:d.rotation,
    track:d.tracktype < 6 ? ['A','B','AB'][d.tracktype%3] : 'CURB',
    side:d.tracktype >= 3 && d.tracktype <= 5 || d.tracktype === 7 ? 'right' : 'left'
  })).sort((a,b) => a.begin-b.begin);
  const merged = [];
  for (let i=0;i<items.length;i++) {
    const it = items[i];
    const chain = [sc.cliff_left,sc.cliff_right].find(c => c[1] !== '0' && (c[0] === it.uuid || c[2] === it.uuid));
    const mid = items[i+1], end = items[i+2];
    if (chain && mid && end && mid.uuid === chain[1] && end.uuid === chain[it.uuid === chain[0] ? 2 : 0]
        && [mid,end].every(d => d.track === it.track && d.side === it.side && d.rotation === it.rotation)
        && Math.abs(mid.begin-it.end)<1 && Math.abs(end.begin-mid.end)<1) {
      merged.push({...it,uuid:chain[1],end:end.end}); i+=2;
    } else merged.push(it);
  }
  return merged.map(it => ({type:decorationVariant(it,index).type || 0,uuid:it.uuid,
    track:it.track,side:it.side,vpos:Math.max(0,(it.begin+it.end)/2),length:it.end-it.begin,rotation:it.rotation}));
}
function snapDecoration(v) { return Math.max(0,Math.min(trackLengthState.total,S.decoSnap ? Math.round(v/5)*5 : v)); }
function nearestDecorationPosition(mx,my) {
  const length = trackLengthState.total;
  if (CPS.length<2 || length<=0) return null;
  const x=canvasX(mx)/zoom,y=canvasY(my)/zoom;
  let best=0,bestDist=Infinity;
  function visit(v) { const p=distanceToCoords(CPS,v),dist=(x-p[0])**2+(y-p[1])**2; if(dist<bestDist){bestDist=dist;best=v;} }
  for(let v=0;v<=length;v+=5) visit(v);
  const end=Math.min(length,best+5),begin=Math.max(0,best-5);
  for(let v=begin;v<=end;v+=0.25) visit(v);
  const a=distanceToCoords(CPS,Math.max(0,best-1)),b=distanceToCoords(CPS,Math.min(length,best+1));
  return {vpos:snapDecoration(best),side:(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0])>0?'left':'right'};
}
function decorationScreenPosition(d) {
  const length=trackLengthState.total,v=Math.min(length,d.vpos);
  const p=distanceToCoords(CPS,v),a=distanceToCoords(CPS,Math.max(0,v-1)),b=distanceToCoords(CPS,Math.min(length,v+1));
  const dx=b[0]-a[0],dy=b[1]-a[1],norm=Math.hypot(dx,dy)||1;
  const symbol = decorationSymbol(d.type, S.sceneryindex);
  const offset=['gate','rallygate'].includes(symbol) ? 0 : S.roadWidth/2*(1+(DECO_TRACK_OFFSET[d.track]||1.35))*(d.side==='left'?1:-1);
  return [worldToScreenX(p[0]+dy/norm*offset),worldToScreenY(p[1]-dx/norm*offset)];
}
function drawDecorations() {
  const count=document.getElementById('deco-count'); if(count)count.textContent=decorations.length+' / '+MAX_DECORATIONS;
  if(CPS.length<2)return;
  mainCtx.save(); mainCtx.setTransform(DPR(),0,0,DPR(),0,0);
  decorations.forEach((d,i)=>{
    const [x,y]=decorationScreenPosition(d),info=DECORATION_TYPE_INFO[d.type]||['?','dot','#AAAAAA'];
    const icon = decorationIcon(d.type, S.sceneryindex);
    const radius = Math.max(isTouchLayout() ? 12 : 6, Math.min(16, 8*Math.sqrt(zoom)));
    const size = radius*2.8;
    const length=d.length||decorationVariant(d,S.sceneryindex).len||50;
    const a=decorationScreenPosition({...d,vpos:Math.max(0,d.vpos-length/2)});
    const b=decorationScreenPosition({...d,vpos:Math.min(trackLengthState.total,d.vpos+length/2)});
    mainCtx.strokeStyle=info[2];mainCtx.lineWidth=1.5;mainCtx.setLineDash([3,3]);
    mainCtx.beginPath();mainCtx.moveTo(...a);mainCtx.lineTo(...b);mainCtx.stroke();mainCtx.setLineDash([]);
    if(icon.complete&&icon.naturalWidth)mainCtx.drawImage(icon,x-size/2,y-size/2,size,size);
    if(i===selectedDeco){mainCtx.strokeStyle=THEME.POLYGON_SELECTED;mainCtx.lineWidth=2;mainCtx.beginPath();mainCtx.arc(x,y,radius+5,0,Math.PI*2);mainCtx.stroke();}
  });mainCtx.restore();
}
function decorationHit(mx,my) {
  if(CPS.length<2)return null;
  let hit=null,distance=isTouchLayout()?24:16;
  for(let i=decorations.length-1;i>=0;i--){const p=decorationScreenPosition(decorations[i]),d=Math.hypot(mx-p[0],my-p[1]);if(d<distance){hit=i;distance=d;}}
  return hit;
}
function placementVariants(side,track) {
  let vs=decorationVariants(S.sceneryindex,decoType,side,track);
  if(decoOneSide)vs=vs.filter(v=>v.disp[0]===0||v.disp[1]===0);
  return vs;
}
function addDecoration(vpos,side,save=true) {
  if(decorations.length>=MAX_DECORATIONS){toast(tr('Decoration limit reached (1000 items).'));return false;}
  const track=document.getElementById('deco-track').value,vs=placementVariants(side,track);
  if(!vs.length)return false;
  const v=vs[Math.floor(Math.random()*vs.length)];
  if(v.disp[side==='right'?1:0]===0)side=side==='left'?'right':'left';
  if(save)saveToHistory();
  decorations.push({type:decoType,uuid:v.uuid,vpos:snapDecoration(vpos),side,track});
  selectedDeco=decorations.length-1;displayChange();return true;
}
function decoLeftClick(mx,my) {
  selectedPoints=[];
  const hit=decorationHit(mx,my);
  if(hit!==null){selectedDeco=hit;decoDragging=true;decoDragSaved=false;displayChange();return;}
  const pos=nearestDecorationPosition(mx,my);if(pos)addDecoration(pos.vpos,pos.side);
}
function decoDragMotion(mx,my) {
  if(!decoDragging||selectedDeco===null)return;
  const pos=nearestDecorationPosition(mx,my);if(!pos)return;
  if(!decoDragSaved){saveToHistory();decoDragSaved=true;}
  decorations[selectedDeco].vpos=pos.vpos;displayChange();
}
function decoDragEnd(){decoDragging=false;decoDragSaved=false;}
function deleteDecoration(){if(selectedDeco===null)return;saveToHistory();decorations.splice(selectedDeco,1);selectedDeco=null;displayChange();}
function decoDeleteAt(mx,my){const i=decorationHit(mx,my);if(i===null)return false;selectedDeco=i;deleteDecoration();return true;}
function flipDecorationSide(){if(selectedDeco===null)return;saveToHistory();const d=decorations[selectedDeco];d.side=d.side==='left'?'right':'left';delete d.rotation;displayChange();}
function cycleDecorationVariant(){if(selectedDeco===null)return;const d=decorations[selectedDeco],vs=decorationVariants(S.sceneryindex,d.type,d.side,d.track);if(!vs.length)return;saveToHistory();d.uuid=vs[(vs.findIndex(v=>v.uuid===d.uuid)+1)%vs.length].uuid;delete d.length;delete d.rotation;displayChange();}
function refreshDecorationPalette(){
  const el=document.getElementById('deco-palette');if(!el)return;el.replaceChildren();
  const sc=decoScenery(S.sceneryindex),types=[...new Set(sc.variants.map(v=>v.type))].filter(t=>t!==17).sort((a,b)=>a-b);
  if(!types.includes(decoType))decoType=types[0];
  for(const type of types){
    const units=sc.variants.filter(v=>v.type===type),both=units.some(v=>v.disp[0]&&v.disp[1]),one=units.some(v=>!v.disp[0]||!v.disp[1]);
    const name=(TYPE_NAME_OVERRIDE[S.sceneryindex]||{})[type]||DECORATION_TYPE_INFO[type][0];
    for(const single of ((type===12||type===18)&&both&&one?[false,true]:[false])){
      const btn=document.createElement('button');btn.className='styled-btn secondary';
      const img=document.createElement('img');img.src=decorationIconURL(type,S.sceneryindex);img.alt='';img.width=44;img.height=44;
      btn.setAttribute('aria-label',tr(name)+(single?' ('+tr('one side')+')':''));
      btn.append(img);decorationIcon(type,S.sceneryindex);
      btn.dataset.type=type;btn.dataset.single=single;
      btn.classList.toggle('active',type===decoType&&single===decoOneSide);
      btn.addEventListener('click',()=>{decoType=type;decoOneSide=single;setToolMode('decorate');refreshDecorationPalette();});el.appendChild(btn);
    }
  }
}
function initDecorations(){
  refreshDecorationPalette();
  document.getElementById('deco-delete').onclick=deleteDecoration;
  document.getElementById('deco-flip').onclick=flipDecorationSide;
  document.getElementById('deco-variant').onclick=cycleDecorationVariant;
  document.getElementById('deco-clear').onclick=async()=>{if(decorations.length&&await messageBox(tr('Decorations'),tr('Remove all decorations?'),[tr('Yes'),tr('No')])===0){saveToHistory();decorations=[];selectedDeco=null;displayChange();}};
  document.getElementById('deco-fill').onclick=()=>{
    const side=document.getElementById('deco-side').value,track=document.getElementById('deco-track').value,vs=placementVariants(side,track);
    if(!vs.length||trackLengthState.total<=0)return;
    const interval=Math.max(5,Number(document.getElementById('deco-interval').value)||100,vs[0].len/2);
    saveToHistory();for(let v=0;v<=trackLengthState.total&&decorations.length<MAX_DECORATIONS;v+=interval)addDecoration(v,side,false);
  };
}
