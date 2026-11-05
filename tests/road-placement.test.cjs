const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),context=vm.createContext({console,TextEncoder,TextDecoder,ArrayBuffer,DataView,Uint8Array,Date,Math,window:{},document:{getElementById:()=>null,querySelector:()=>null,addEventListener:()=>{}},requestAnimationFrame:()=>{},localStorage:{setItem:()=>{}},setTimeout:()=>{},clearTimeout:()=>{},syncSidebarControls:()=>{}});
for(const file of ['geometry','heightmap','ted','decoration-data','decoration-icons','mobile','construct','isoview','app','decorations','path-trace','project','road-types-data','road-placement'])vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),context,{filename:file+'.js'});
const run=code=>vm.runInContext(code,context),json=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
run(`var banks=[{vpos:0,vlen:2000,vpos2d:0,vlen2d:2000,vpos3d:0,vlen3d:2200}];var state={sceneryindex:3,circuit:true};var normal=ROAD_TYPES[3].normal[0][0];var base=[{uuid:ROAD_TYPES[3].start[0][0],flag:2,vposIncludeHeight:0,vposIncludeHeight2:330},{uuid:normal,flag:0,vposIncludeHeight:330,vposIncludeHeight2:1100},{uuid:normal,flag:0,vposIncludeHeight:1100,vposIncludeHeight2:0}];var stamp={typeId:'andalusia-restaurant',scenery:3,start:500,flag:1};var applied=applyRoadPlacements(base,banks,state,[stamp]);`);
const rows=run('applied');assert.equal(rows.length,5);const restaurant=rows.find(r=>r.uuid===0xB4CB0024E8474511n);assert.equal(restaurant.flag,1);assert.equal(restaurant.vlen,150);assert.equal(restaurant.vposIncludeHeight,550);assert.ok(Math.abs(restaurant.vposIncludeHeight2-715)<1e-9);assert.equal(rows.at(-1).vposIncludeHeight2,0);
assert.strictEqual(run('applyRoadPlacements(base,banks,state,[])'),run('base'),'Unmodified layout did not retain original road list');
for(const code of [
 'applyRoadPlacements(base,banks,state,[{...stamp,start:200}])',
 'applyRoadPlacements(base,banks,state,[{...stamp,start:1900}])',
 'applyRoadPlacements(base,banks,state,[stamp,{...stamp,start:600}])',
 'applyRoadPlacements(base,banks,state,[{...stamp,scenery:2}])',
 'applyRoadPlacements(base,banks,state,[{...stamp,flag:2}])',
 'applyRoadPlacements(base,banks,state,[{...stamp,start:NaN}])',
 'applyRoadPlacements(base,banks,state,[{...stamp,typeId:"not-a-road"}])',
 'applyRoadPlacements(base.map((r,i)=>i===0?{...r,flag:0}:r),banks,state,[{...stamp,start:200}])'
])assert.throws(()=>run(code),code);
run(`var eifelBase=base.map((r,i)=>({...r,uuid:i===0?ROAD_TYPES[2].start[0][0]:ROAD_TYPES[2].normal[0][0]}));var group=roadTypeById('eifel-sand-left',2);var groupRows=applyRoadPlacements(eifelBase,banks,{sceneryindex:2,circuit:true},[{typeId:group.id,scenery:2,start:500,flag:0}]);`);
const group=run('group'),groupRows=run('groupRows');assert.equal(group.segments.length,3);assert.deepEqual(json(groupRows.filter(r=>group.segments.some(s=>BigInt('0x'+s.uuid)===r.uuid)).map(r=>r.vlen)),[50,100,50]);
run(`polygon=[makeCoordinate(0,0,0,40,-1,1),makeCoordinate(1000,0,0,40,-1,1),makeCoordinate(1000,1000,0,40,-1,1),makeCoordinate(0,1000,0,40,-1,1)];S.sceneryindex=3;S.heightMap={coordToFraction:()=>0};roadPlacements=[stamp];decorations=[];var project=parseProjectFile(makeWebProject(S,polygon,decorations));`);
assert.deepEqual(json(run('project.roadPlacements')),json(run('roadPlacements')));
run('saveToHistory();roadPlacements=[];undo();');assert.equal(run('roadPlacements.length'),1);run('redo();');assert.equal(run('roadPlacements.length'),0);
run(`roadPlacements=[{...stamp,start:1000}];var exported=constructTEDData(polygon,S);var exportedBytes=generateTedFile(exported);var parsed=new TEDTrackObject(exportedBytes);`);
assert.ok(run('parsed.roads.some(r=>r.uuid===0xB4CB0024E8474511n)'));
assert.equal(run('roadTypeLength(roadTypeById("andalusia-restaurant",3))'),150);
assert.equal(run('roadTypeCatalog(1).length'),7);assert.equal(run('roadTypeCatalog(3).length'),12);
run(`for(const type of window.TLCRoadTypes){for(const scenery of Array.isArray(type.scenery)?type.scenery:[type.scenery]){const set=ROAD_TYPES[scenery],baseRoads=base.map((road,index)=>({...road,uuid:index===0?set.start[0][0]:set.normal[0][0]})),placed=applyRoadPlacements(baseRoads,banks,{sceneryindex:scenery,circuit:true},[{typeId:type.id,scenery,start:1000,flag:0}]);let d=1100;for(const segment of type.segments){const road=placed.find(r=>r.uuid===BigInt('0x'+segment.uuid)&&Math.abs(r.vposIncludeHeight-d)<1e-6);if(!road||Math.abs(road.vlen-segment.len)>1e-6)throw Error('Missing road recipe part '+type.id);d+=segment.len*1.1;}}}`);
console.log('PASS: road span bounds/protection/overlap/scenery, complete multipart chains, 2D→3D mapping, loop sentinel, project persistence, undo/redo and TED export');
