/* Exact in-place ROAD UUID editing; no geometry regeneration. */
'use strict';
(function(root){
 const RESTAURANT=0xB4CB0024E8474511n,NORMAL=0xABF20024E8474511n;
 function read(buffer){
  const bytes=new Uint8Array(buffer),v=new DataView(buffer);
  if(bytes.length<156||v.getBigUint64(0)!==0x4754365445440000n)throw Error('Invalid GT6 TED file');
  const offset=v.getUint32(132),count=v.getUint32(136),scenery=v.getUint32(12);
  if(offset>bytes.length||count&&offset<156||count>5000000||offset+count*20>bytes.length)throw Error('Invalid TED road table');
  return {scenery,offset,length:v.getFloat32(28),circuit:v.getUint32(36)!==0,rows:Array.from({length:count},(_,i)=>{const p=offset+i*20;return {index:i,uuid:v.getBigUint64(p),flag:v.getUint32(p+8),begin:v.getFloat32(p+12),end:v.getFloat32(p+16)};})};
 }
 function choices(scenery){return (root.TLCRoadTypes||[]).filter(type=>(Array.isArray(type.scenery)?type.scenery.includes(scenery):type.scenery===scenery)&&type.segments.length===1);}
 function replaceType(buffer,indices,uuid,flag){
  const data=read(buffer);uuid=BigInt(uuid);
  const known=choices(data.scenery).some(type=>BigInt('0x'+type.segments[0].uuid)===uuid);
  if(!known&&!(data.scenery===3&&[RESTAURANT,NORMAL].includes(uuid)))throw Error('Road type does not belong to this scenery');
  if(flag!==undefined&&![0,1].includes(flag))throw Error('Road orientation must be flag 0 or 1');
  const sets=typeof ROAD_TYPES==='undefined'?null:ROAD_TYPES[data.scenery],protectedIds=sets?[...sets.start,...sets.startsprint,...sets.endsprint].map(entry=>entry[0]):[];
  const unique=[...new Set(indices)];for(const i of unique)if(!Number.isInteger(i)||!data.rows[i]||![0,1].includes(data.rows[i].flag)||protectedIds.includes(data.rows[i].uuid))throw Error('Select ordinary road sections, not start/finish sections');
  const output=buffer.slice(0),v=new DataView(output);for(const i of unique){v.setBigUint64(data.offset+i*20,uuid);if(flag!==undefined)v.setUint32(data.offset+i*20+8,flag);}return output;
 }
 function replace(buffer,indices,restaurant=true){
  if(read(buffer).scenery!==3)throw Error('Restaurant road is currently verified only for Andalusia');return replaceType(buffer,indices,restaurant?RESTAURANT:NORMAL);
 }
 function open(){
  const input=document.createElement('input');input.type='file';input.accept='.ted';input.onchange=async()=>{
   try{
    const file=input.files[0];if(!file)return;let buffer=await file.arrayBuffer();const data=read(buffer);
    const dialog=document.createElement('dialog');dialog.style.cssText='width:min(760px,90vw);max-height:85vh;background:var(--panel-bg,#252525);color:var(--text,#eee);border:1px solid #777;padding:20px';
    const title=document.createElement('h2');title.textContent='TED road sections';dialog.append(title);
    const info=document.createElement('p');info.textContent='Select existing road sections and choose a documented single-piece type. Existing lengths are retained. Use Geometry → Road types to place a complete span at its nominal length, including multipart types. Start/finish sections are protected. In-game appearance still needs verification.';dialog.append(info);
    const list=document.createElement('select');list.multiple=true;list.size=12;list.style.cssText='width:100%;background:inherit;color:inherit;font:inherit';dialog.append(list);
    const types=choices(data.scenery),typeSelect=document.createElement('select');typeSelect.setAttribute('aria-label','Road type');typeSelect.style.cssText='width:100%;margin-top:10px';
    for(const type of types){const option=document.createElement('option');option.value=type.segments[0].uuid;option.textContent=type.name+' · nominal '+type.segments[0].len+' m';typeSelect.append(option);}dialog.append(typeSelect);
    const flagSelect=document.createElement('select');flagSelect.setAttribute('aria-label','Road orientation');for(const [value,text] of [['','Keep current orientation'],['0','X (flag 0)'],['1','Y (flag 1)']]){const option=document.createElement('option');option.value=value;option.textContent=text;flagSelect.append(option);}dialog.append(flagSelect);
    const fill=()=>{list.replaceChildren();const current=read(buffer);for(const road of current.rows){const type=types.find(t=>BigInt('0x'+t.segments[0].uuid)===road.uuid),option=document.createElement('option'),end=current.circuit&&road.index===current.rows.length-1&&road.end===0?current.length:road.end;option.value=road.index;option.textContent=`#${road.index} · ${type?type.name:road.uuid.toString(16).toUpperCase()} · ${road.begin.toFixed(1)}–${end.toFixed(1)} m · flag ${road.flag}`;list.append(option);}};fill();
    const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:14px';dialog.append(buttons);
    const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='styled-btn';b.textContent=text;b.onclick=()=>{try{fn();}catch(e){alert(e.message);}};buttons.append(b);return b;};
    button('Apply road type',()=>{const selected=[...list.selectedOptions].map(o=>Number(o.value));if(!selected.length||!typeSelect.value)return;buffer=replaceType(buffer,selected,'0x'+typeSelect.value,flagSelect.value===''?undefined:Number(flagSelect.value));fill();}).disabled=types.length===0;
    button('Save TED copy',()=>{downloadBlob(new Blob([buffer],{type:'application/octet-stream'}),file.name.replace(/\.ted$/i,'')+'-roads.ted');});button('Close',()=>dialog.close());
    dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();list.focus();
   }catch(e){alert(e.message);}
  };input.click();
 }
 const api={read,replace,replaceType,choices,open,RESTAURANT,NORMAL};root.TLCRoadSections=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
