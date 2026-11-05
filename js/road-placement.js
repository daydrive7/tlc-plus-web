/* Road meshes are ordered spans, not decoration UUIDs. */
'use strict';
let roadPlacements=[],selectedRoadPlacement=null,roadTypeDragging=false,roadTypeDragSaved=false;
function roadTypeCatalog(scenery){return (window.TLCRoadTypes||[]).filter(type=>Array.isArray(type.scenery)?type.scenery.includes(scenery):type.scenery===scenery);}
function roadTypeById(id,scenery){return roadTypeCatalog(scenery).find(type=>type.id===id);}
function roadTypeLength(type){return type.segments.reduce((sum,segment)=>sum+segment.len,0);}
function validateRoadPlacementData(items){
 if(!Array.isArray(items)||items.length>2000)throw Error('Invalid road placements');
 return items.map(item=>{if(!item||typeof item.typeId!=='string'||![1,2,3,4,5].includes(item.scenery)||!Number.isFinite(item.start)||item.start<0||![0,1].includes(item.flag)||!roadTypeById(item.typeId,item.scenery))throw Error('Invalid road placement');return {typeId:item.typeId,scenery:item.scenery,start:item.start,flag:item.flag};});
}
function applyRoadPlacements(roads,banks,state,items){
 items=validateRoadPlacementData(items||[]);if(!items.length)return roads;
 const total=banks.reduce((sum,b)=>sum+(b.vlen2d===undefined?b.vlen:b.vlen2d),0),epsilon=1e-6;
 const stamps=items.map(item=>{const type=roadTypeById(item.typeId,state.sceneryindex);if(!type||item.scenery!==state.sceneryindex)throw Error('Road type does not belong to this scenery');return {...item,type,end:item.start+roadTypeLength(type)};}).sort((a,b)=>a.start-b.start);
 for(let i=0;i<stamps.length;i++){const stamp=stamps[i];if(stamp.end>total+epsilon)throw Error('Road type does not fit inside the track');if(i&&stamp.start<stamps[i-1].end-epsilon)throw Error('Road type spans overlap');}
 let spans=roads.map((road,index)=>({start:distFromIncludeHeight(banks,road.vposIncludeHeight),end:state.circuit&&index===roads.length-1&&road.vposIncludeHeight2===0?total:distFromIncludeHeight(banks,road.vposIncludeHeight2),road}));
 function cut(span,start,end){return {start,end,road:{...span.road,vlen:end-start,vposIncludeHeight:distToIncludeHeight(banks,start),vposIncludeHeight2:state.circuit&&Math.abs(end-total)<epsilon?0:distToIncludeHeight(banks,end)}};}
 for(const stamp of stamps){
  const next=[];let covered=0;
  for(const span of spans){
   const overlap=Math.min(span.end,stamp.end)-Math.max(span.start,stamp.start);
   if(overlap<=epsilon){next.push(span);continue;}
   const sets=ROAD_TYPES[state.sceneryindex]||ROAD_TYPES_DATA.eifel,protectedIds=[...sets.start,...sets.startsprint,...sets.endsprint].map(entry=>entry[0]);
   if(![0,1].includes(span.road.flag)||protectedIds.includes(BigInt(span.road.uuid)))throw Error('Road types cannot replace start/finish or protected sections');
   covered+=overlap;if(span.start<stamp.start-epsilon)next.push(cut(span,span.start,stamp.start));if(span.end>stamp.end+epsilon)next.push(cut(span,stamp.end,span.end));
  }
  if(Math.abs(covered-(stamp.end-stamp.start))>.01)throw Error('Road type does not fit the road section coverage');
  let start=stamp.start;for(const segment of stamp.type.segments){const end=start+segment.len;next.push(cut({road:{uuid:BigInt('0x'+segment.uuid),flag:stamp.flag}},start,end));start=end;}
  spans=next.sort((a,b)=>a.start-b.start);
 }
 return spans.map(span=>span.road);
}
function currentRoadPlacementBanks(){
 const banks=constructBank(CPS);for(const bank of banks){bank.vlen2d=bank.vlen;bank.vlen3d=bank.vlen;bank.vpos2d=bank.vpos;bank.vpos3d=bank.vpos;}return banks;
}
function validateCurrentRoadPlacements(items){if(CPS.length<2)throw Error('Create a track first');const banks=currentRoadPlacementBanks();return applyRoadPlacements(constructRoads(banks,S),banks,S,items);}
function roadPlacementAt(mx,my){
 let best=-1,distance=22;for(let i=0;i<roadPlacements.length;i++){const p=roadPlacements[i],type=roadTypeById(p.typeId,p.scenery);if(!type)continue;const point=distanceToCoords(CPS,p.start+roadTypeLength(type)/2),d=Math.hypot(worldToScreenX(point[0])-mx,worldToScreenY(point[1])-my);if(d<distance){distance=d;best=i;}}return best;
}
function roadPlacementClick(mx,my){
 if(CPS.length<2)return;const hit=roadPlacementAt(mx,my);if(hit>=0){selectedRoadPlacement=hit;roadTypeDragging=true;roadTypeDragSaved=false;refreshRoadTypeControls();displayChange();return;}
 const nearest=nearestDecorationPosition(mx,my),selector=document.getElementById('road-type-select');if(!nearest||!selector)return;
 const point=distanceToCoords(CPS,nearest.vpos);if(Math.hypot(worldToScreenX(point[0])-mx,worldToScreenY(point[1])-my)>30)return;
 const type=roadTypeById(selector.value,S.sceneryindex);if(!type)return;
 const placement={typeId:type.id,scenery:S.sceneryindex,start:nearest.vpos-roadTypeLength(type)/2,flag:Number(document.getElementById('road-type-side').value)};
 try{validateCurrentRoadPlacements([...roadPlacements,placement]);saveToHistory();roadPlacements.push(placement);selectedRoadPlacement=roadPlacements.length-1;refreshRoadTypeControls();displayChange();}
 catch(e){toast(tr(e.message),'warning');}
}
function roadPlacementMotion(mx,my){
 if(!roadTypeDragging||selectedRoadPlacement===null)return;const old=roadPlacements[selectedRoadPlacement],type=roadTypeById(old.typeId,S.sceneryindex),point=nearestDecorationPosition(mx,my);if(!point||!type)return;
 const candidate={...old,start:point.vpos-roadTypeLength(type)/2};if(candidate.start===old.start)return;
 const next=roadPlacements.map((p,i)=>i===selectedRoadPlacement?candidate:p);
 try{validateCurrentRoadPlacements(next);if(!roadTypeDragSaved){saveToHistory();roadTypeDragSaved=true;}roadPlacements=next;refreshRoadTypeControls();displayChange();}catch(e){const status=document.getElementById('road-type-info');if(status)status.textContent=tr(e.message);}
}
function roadPlacementRelease(){roadTypeDragging=false;roadTypeDragSaved=false;refreshRoadTypeControls();displayChange();}
function deleteRoadPlacement(index){if(index===null||index<0||index>=roadPlacements.length)return false;saveToHistory();roadPlacements.splice(index,1);selectedRoadPlacement=null;refreshRoadTypeControls();displayChange();return true;}
function drawRoadPlacements(){
 if(CPS.length<2)return;
 for(let i=0;i<roadPlacements.length;i++){const p=roadPlacements[i],type=roadTypeById(p.typeId,S.sceneryindex);if(!type)continue;const end=p.start+roadTypeLength(type);if(p.start<0||end>trackLengthState.total)continue;
  drawTrackSection(p.start,end,i===selectedRoadPlacement?'#ffb347':'#b36dff',Math.max(5,S.roadWidth*zoom+4));
  const point=distanceToCoords(CPS,(p.start+end)/2),x=worldToScreenX(point[0]),y=worldToScreenY(point[1]);mainCtx.save();mainCtx.fillStyle=i===selectedRoadPlacement?'#ffb347':'#b36dff';mainCtx.strokeStyle='#111';mainCtx.lineWidth=1;mainCtx.beginPath();mainCtx.rect(x-5,y-5,10,10);mainCtx.fill();mainCtx.stroke();if(toolMode==='road'){mainCtx.font='11px Segoe UI';mainCtx.fillText(tr(type.name),x+9,y-9);}mainCtx.restore();
 }
}
let roadTypeControlScenery=null;
function refreshRoadTypeControls(){
 const select=document.getElementById('road-type-select'),info=document.getElementById('road-type-info'),list=document.getElementById('road-type-placements');if(!select)return;
 if(roadTypeControlScenery!==S.sceneryindex){const chosen=select.value;select.replaceChildren();for(const type of roadTypeCatalog(S.sceneryindex)){const option=document.createElement('option');option.value=type.id;option.textContent=tr(type.name)+' · '+roadTypeLength(type)+' m';select.append(option);}if([...select.options].some(o=>o.value===chosen))select.value=chosen;roadTypeControlScenery=S.sceneryindex;}
 const equip=document.getElementById('road-type-equip');if(equip){equip.disabled=select.options.length===0;equip.setAttribute('aria-pressed',String(toolMode==='road'));}
 if(info){const selected=selectedRoadPlacement===null?null:roadPlacements[selectedRoadPlacement],type=selected&&roadTypeById(selected.typeId,selected.scenery);info.textContent=selected&&type?tr('Selected road span')+': '+selected.start.toFixed(1)+'–'+(selected.start+roadTypeLength(type)).toFixed(1)+' m':roadPlacements.length+' '+tr('placed road spans');}
 if(list){list.replaceChildren();for(let i=0;i<roadPlacements.length;i++){const p=roadPlacements[i],type=roadTypeById(p.typeId,p.scenery),option=document.createElement('option');option.value=i;option.textContent=(type?tr(type.name):p.typeId)+' · '+p.start.toFixed(1)+' m';list.append(option);}list.value=selectedRoadPlacement===null?'':String(selectedRoadPlacement);}
}
function initRoadTypes(){
 const equip=document.getElementById('road-type-equip');if(!equip)return;equip.onclick=()=>{setToolMode('road');refreshRoadTypeControls();toast(tr('Click the road to place a road type. Drag its marker to move it.'));};
 document.getElementById('road-type-delete').onclick=()=>deleteRoadPlacement(selectedRoadPlacement);
 document.getElementById('road-type-clear').onclick=async()=>{if(!roadPlacements.length)return;if(await messageBox(tr('Road types'),tr('Remove all placed road types?'),[tr('Yes'),tr('No')])!==0)return;saveToHistory();roadPlacements=[];selectedRoadPlacement=null;refreshRoadTypeControls();displayChange();};
 document.getElementById('road-type-placements').onchange=e=>{selectedRoadPlacement=e.target.value===''?null:Number(e.target.value);refreshRoadTypeControls();displayChange();};refreshRoadTypeControls();
}
window.TLCRoadPlacements={apply:applyRoadPlacements,validateData:validateRoadPlacementData,catalog:roadTypeCatalog};
