/* Touch-first editing and an illustrated guide for TLC+ Web. */
'use strict';
let mobileMultiSelect = false;
function isTouchLayout() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse), (max-width: 700px)').matches);
}

function fitTrackInView() {
  const points = polygon.length ? polygon : referencePath;
  if (!points.length) return;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const rect=mainCanvas.getBoundingClientRect();
  // Leave room for fingers and the bottom tool palette.
  const toolbar=document.getElementById('toolbar');
  const bottom=isTouchLayout()?(toolbar.getBoundingClientRect().height+20):30;
  zoom=Math.max(minZoom,Math.min(maxZoom,(rect.width-70)/Math.max(100,maxX-minX),(rect.height-bottom-50)/Math.max(100,maxY-minY)));
  panX=rect.width/2-(minX+maxX)/2*zoom;
  panY=(rect.height-bottom)/2-(minY+maxY)/2*zoom;
  clampPan();displayChange();
}

function showDecorationProperties() {
  if (selectedDeco === null || !decorations[selectedDeco]) return;
  const index=selectedDeco,d=decorations[index];
  openModal(tr('Decoration'),(body,backdrop)=>{
    const form=document.createElement('div');form.className='mobile-deco-form';
    for(const [key,name,values] of [['vpos','Distance (m)',null],['side','Side',['left','right']],['track','Track',['A','B','AB','CURB']]]){
      const label=document.createElement('label');label.textContent=tr(name);
      const input=document.createElement(values?'select':'input');input.dataset.key=key;
      if(values)for(const value of values){const option=document.createElement('option');option.value=value;option.textContent=tr(value);input.appendChild(option);}
      else {input.type='number';input.min=0;input.max=trackLengthState.total;input.step=S.decoSnap?5:1;}
      input.value=d[key];label.appendChild(input);form.appendChild(label);
    }
    const cycle=document.createElement('button');cycle.className='styled-btn';cycle.textContent=tr('Cycle variant');cycle.onclick=()=>{cycleDecorationVariant();};
    const apply=document.createElement('button');apply.className='styled-btn';apply.textContent=tr('Apply Changes');
    apply.onclick=()=>{
      const v=Number(form.querySelector('[data-key="vpos"]').value);if(!Number.isFinite(v))return;
      saveToHistory();d.vpos=snapDecoration(v);
      const side=form.querySelector('[data-key="side"]').value;
      if(side!==d.side)delete d.rotation;
      d.side=side;d.track=form.querySelector('[data-key="track"]').value;
      backdrop.remove();displayChange();
    };
    body.append(form,cycle,apply);
  });
}

function updateMobileActions() {
  const bar=document.getElementById('mobile-actions');if(!bar)return;
  const deco=toolMode==='decorate'&&selectedDeco!==null;
  bar.querySelector('[data-mobile="edit"]').disabled=!(deco||selectedPoints.length);
  bar.querySelector('[data-mobile="delete"]').disabled=!(deco||selectedPoints.length);
  const multi=bar.querySelector('[data-mobile="multi"]');multi.classList.toggle('active',mobileMultiSelect);multi.setAttribute('aria-pressed',String(mobileMultiSelect));
  const hint=document.getElementById('mobile-hint');
  const hints={pen:'Tap to place a node · drag empty space to pan',selection:'Tap or drag a node · Multi selects several',decorate:'Tap beside the track · drag an icon to move it',camber:'Drag a node up/down to change camber',pan:'Drag to pan · pinch with two fingers to zoom',rotate:'Select several nodes · drag to rotate',scale:'Select several nodes · drag up/down to scale'};
  const text=tr(hints[toolMode]||hints.selection);if(hint.textContent!==text)hint.textContent=text;
}

function initMobileControls() {
  const drawerHeader=document.createElement('div');drawerHeader.id='mobile-sidebar-header';
  const drawerTitle=document.createElement('span');drawerTitle.textContent=tr('Settings');
  const drawerClose=document.createElement('button');drawerClose.textContent=tr('Close');drawerClose.setAttribute('aria-label',tr('Close settings sidebar'));drawerClose.onclick=toggleSidebar;
  drawerHeader.append(drawerTitle,drawerClose);document.getElementById('left-panel').prepend(drawerHeader);
  const bar=document.createElement('div');bar.id='mobile-actions';bar.setAttribute('aria-label','Touch editing actions');
  const actions=[['multi','Multi',()=>{mobileMultiSelect=!mobileMultiSelect;setToolMode('selection');updateMobileActions();}],
    ['all','All',()=>{setToolMode('selection');selectAll();}],
    ['edit','Edit',()=>{if(toolMode==='decorate')showDecorationProperties();else editPointProperties();}],
    ['delete','Delete',()=>{if(toolMode==='decorate')deleteDecoration();else deletePoints();}],
    ['fit','Fit',fitTrackInView],['help','Help',showMobileHelp]];
  for(const [id,label,action] of actions){const button=document.createElement('button');button.dataset.mobile=id;button.textContent=tr(label);button.title=tr(label);button.onclick=action;bar.appendChild(button);}
  const hint=document.createElement('div');hint.id='mobile-hint';hint.setAttribute('aria-live','polite');
  const panel=document.getElementById('right-panel');panel.prepend(bar,hint);
  const labels={pen:'Pen',selection:'Select',camber:'Camber',pan:'Pan',decorate:'Decorate','btn-zoom-in':'Zoom +','btn-zoom-out':'Zoom −','btn-undo':'Undo','btn-redo':'Redo','btn-reverse':'Reverse','btn-screenshot':'Photo'};
  document.querySelectorAll('#toolbar .tool-btn').forEach(button=>{
    const label=document.createElement('span');label.className='touch-tool-label';label.textContent=tr(labels[button.dataset.tool||button.id]);button.appendChild(label);
    button.setAttribute('aria-label',button.title||label.textContent);
  });
  document.querySelector('#btn-toggle-sidebar').setAttribute('aria-label',tr('Settings sidebar'));
  updateMobileActions();
}

function bindMobileCanvas(canvas) {
  let gesture=null,pinch=null,lastTap=null;
  const local=t=>{const rect=canvas.getBoundingClientRect();return [t.clientX-rect.left,t.clientY-rect.top];};
  function rollback(){
    if(gesture&&gesture.editing){restoreSnapshot(gesture.before);history.length=gesture.historyLength;future=gesture.future;selectedPoints=gesture.selection;selectedDeco=gesture.selectedDecoration;}
    decoDragEnd();interacting=false;
  }
  function startPinch(e){
    rollback();gesture=null;
    const a=local(e.touches[0]),b=local(e.touches[1]);
    pinch={distance:Math.hypot(b[0]-a[0],b[1]-a[1])||1,zoom,panX,panY,x:(a[0]+b[0])/2,y:(a[1]+b[1])/2};
  }
  function tap(x,y){
    const hit=getPointIndex(x,y);
    if(mobileMultiSelect&&['selection','pen'].includes(toolMode)&&hit!==null){
      if(selectedPoints.includes(hit))selectedPoints=selectedPoints.filter(i=>i!==hit);else selectedPoints.push(hit);
      polygonChange();return;
    }
    if(toolMode==='pen'&&hit===null)selectedPoints=[];
    leftClick(x,y,false,false);b1Release();
    if(hit!==null&&['selection','pen','camber'].includes(toolMode)){
      const now=Date.now();if(lastTap&&lastTap.index===hit&&now-lastTap.time<350){editPointProperties();lastTap=null;}else lastTap={index:hit,time:now};
    }
  }
  canvas.addEventListener('touchstart',e=>{
    e.preventDefault();
    if(e.touches.length>=2){startPinch(e);return;}
    const [x,y]=local(e.touches[0]);
    gesture={x,y,lastX:x,lastY:y,moved:false,editing:false,pan:false,point:getPointIndex(x,y),deco:decorationHit(x,y),before:snapshotPolygon(),historyLength:history.length,future:future.slice(),selection:selectedPoints.slice(),selectedDecoration:selectedDeco};
    pinch=null;
  },{passive:false});
  canvas.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length>=2){
      if(!pinch)startPinch(e);
      const a=local(e.touches[0]),b=local(e.touches[1]);
      const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
      zoom=Math.max(minZoom,Math.min(maxZoom,pinch.zoom*Math.hypot(b[0]-a[0],b[1]-a[1])/pinch.distance));
      panX=x-(pinch.x-pinch.panX)/pinch.zoom*zoom;panY=y-(pinch.y-pinch.panY)/pinch.zoom*zoom;
      clampPan();displayChange();return;
    }
    // Lifting one finger from a pinch never turns into a node edit.
    if(pinch||!gesture)return;
    const [x,y]=local(e.touches[0]);
    if(!gesture.moved&&Math.hypot(x-gesture.x,y-gesture.y)<7)return;
    if(!gesture.moved){
      gesture.moved=true;
      gesture.editing=(toolMode==='decorate'?gesture.deco!==null:gesture.point!==null&&toolMode!=='pan')||(['rotate','scale'].includes(toolMode)&&selectedPoints.length>1);
      gesture.pan=!gesture.editing;
      if(gesture.editing)leftClick(gesture.x,gesture.y,false,false);
      mouseLocation={x:gesture.x,y:gesture.y};
    }
    if(gesture.pan){panView(x,y);mouseLocation={x,y};}else b1Motion(x,y);
    gesture.lastX=x;gesture.lastY=y;
  },{passive:false});
  canvas.addEventListener('touchend',e=>{
    e.preventDefault();
    if(pinch){if(!e.touches.length){pinch=null;gesture=null;displayChange();}return;}
    if(!gesture)return;
    if(!gesture.moved)tap(gesture.x,gesture.y);else b1Release();
    gesture=null;interacting=false;displayChange();
  },{passive:false});
  canvas.addEventListener('touchcancel',()=>{rollback();gesture=null;pinch=null;displayChange();});
}

function mobileGestureDiagram(kind) {
  const base='<path class="guide-track" d="M18 61 Q42 8 81 29 T143 46"/><circle class="guide-node" cx="81" cy="29" r="5"/>';
  const finger=(x,y,cls='')=>'<g class="guide-finger '+cls+'"><circle cx="'+x+'" cy="'+y+'" r="11"/><circle class="guide-contact" cx="'+x+'" cy="'+y+'" r="3"/></g>';
  const arrow='<path class="guide-arrow" d="M52 65 L106 42 M96 43 L106 42 L102 53"/>';
  let marks='';
  if(kind==='tap')marks=finger(81,29,'guide-tap');
  if(kind==='drag')marks=arrow+finger(62,61,'guide-drag');
  if(kind==='pinch')marks='<path class="guide-arrow" d="M62 45 L31 45 M40 38 L31 45 L40 52 M98 45 L129 45 M120 38 L129 45 L120 52"/>'+finger(57,45,'guide-pinch-left')+finger(103,45,'guide-pinch-right');
  if(kind==='edit')marks='<rect class="guide-action" x="21" y="59" width="52" height="24" rx="5"/><text x="47" y="75">Edit</text><rect class="guide-action" x="86" y="59" width="52" height="24" rx="5"/><text x="112" y="75">Delete</text>';
  if(kind==='deco')marks='<image href="'+decorationIconURL(1,5)+'" x="58" y="32" width="38" height="38"/>'+finger(108,62,'guide-tap');
  if(kind==='iso')marks='<path class="guide-arrow" d="M30 41 H130 M122 34 L130 41 L122 48 M80 18 V76 M73 68 L80 76 L87 68"/>'+finger(80,46,'guide-drag');
  return '<svg viewBox="0 0 160 96" role="img" aria-label="'+kind+' gesture">'+base+marks+'</svg>';
}
function showMobileHelp() {
  openModal(tr('Controls (Mobile)'),body=>{
    const intro=document.createElement('p');intro.className='mobile-guide-intro';intro.textContent=tr('Use the tools at the bottom and the action buttons at the top. Two fingers always move the view without editing your track.');
    const grid=document.createElement('div');grid.className='mobile-guide';
    const cards=[['tap','Tap to draw','Choose Pen, then tap empty space to add a node. Tap a road segment to insert a node.'],
      ['drag','Drag to move','Choose Select and drag a node. Drag empty space with any tool to pan. Turn Multi on to select several nodes; All selects the whole layout.'],
      ['pinch','Pinch to navigate','Spread two fingers to zoom in; pinch to zoom out. Slide both fingers together to pan. Fit brings the whole track into view.'],
      ['edit','Edit and delete','Tap a node, then Edit for its radius, camber and height. Delete removes the selection. Undo and Redo are in the bottom toolbar. Double-tap a node also opens Edit.'],
      ['deco','Place decorations','Open Sidebar → Decorations and choose an icon. Tap beside the track to place it; drag the icon to move it. Edit changes its side, distance, track and variant; Delete removes it.'],
      ['iso','Explore in 3D','Open File → Draw isometric view. Drag one finger left/right to rotate or up/down to tilt. Use two fingers to pan and pinch to zoom.']];
    for(const [kind,title,text] of cards){const card=document.createElement('article');card.innerHTML=mobileGestureDiagram(kind);const h=document.createElement('h3');h.textContent=tr(title);const p=document.createElement('p');p.textContent=tr(text);card.append(h,p);grid.appendChild(card);}
    body.append(intro,grid);
  });
}
