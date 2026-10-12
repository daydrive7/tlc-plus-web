/* Browser project persistence. Desktop TRK5 remains available for interchange. */
'use strict';
function applyViewVisibility(){
  for(const id of ['nav-area','elev-splitter']){const el=document.getElementById(id);if(el)el.classList.toggle('hidden',!S.showElevation);}
  const title=document.querySelector('.tb-title');if(title)title.classList.toggle('hidden',!S.showTitle);
  if(mainCanvas){sizeCanvases();displayChange();}
}
function makeWebProject(state,points,items){
  const savedState={};
  for(const [k,v] of Object.entries(state)){if(['number','string','boolean'].includes(typeof v)&&!['trackLength','cornerCount','optimizeInteraction'].includes(k))savedState[k]=v;}
  return new TextEncoder().encode(JSON.stringify({format:'TLC+ Web',version:1,desktopVersion:'1.3.0',state:savedState,polygon:points.map(p=>[p.x,p.y,p.z,p.radius,p.camber,p.segments]),decorations:items})).buffer;
}
function parseProjectFile(buffer){
  const text=new TextDecoder().decode(buffer);
  if(!text.trimStart().startsWith('{'))return parseTrkFile(buffer);
  const p=JSON.parse(text);
  if(p.format!=='TLC+ Web'||p.version!==1||!Array.isArray(p.polygon)||!Array.isArray(p.decorations))throw new Error('Invalid TLC+ Web project');
  if(p.polygon.some(v=>!Array.isArray(v)||v.length!==6||v.some(n=>!Number.isFinite(n))))throw new Error('Invalid project coordinates');
  if(![1,2,3,4,5].includes(p.state.sceneryindex))throw new Error('Invalid project scenery');
  if(p.decorations.length>MAX_DECORATIONS||p.decorations.some(d=>!/^\d+$/.test(d.uuid)||!Number.isFinite(d.vpos)||d.vpos<0||!['left','right'].includes(d.side)||!['A','B','AB','CURB'].includes(d.track)))throw new Error('Invalid project decorations');
  const state={};for(const [k,v] of Object.entries(p.state)){if(k!=='optimizeInteraction'&&Object.prototype.hasOwnProperty.call(S,k)&&['number','string','boolean'].includes(typeof v))state[k]=v;}
  return {state,polygon:p.polygon.map(v=>makeCoordinate(...v)),decorations:p.decorations};
}
async function exportDesktopTrack(){
  if(decorations.length&&await messageBox(tr('Export desktop track (.trk5)'),tr('TRK5 does not store decorations. Save a .tlcw project to keep them, or export TED for the game. Export geometry as TRK5?'),[tr('Yes'),tr('No')])!==0)return;
  downloadBlob(new Blob([makeTrk5(S,polygon)],{type:'application/octet-stream'}),timestampName('.trk5'));
}
