const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const context=vm.createContext({console,TextEncoder,TextDecoder,ArrayBuffer,DataView,Uint8Array,Date,Math,
 window:{},document:{getElementById:()=>null,querySelector:()=>null,addEventListener:()=>{}},
 requestAnimationFrame:()=>{},localStorage:{setItem:()=>{}},setTimeout:()=>{},clearTimeout:()=>{}});
for(const name of ['geometry','heightmap','ted','decoration-data','decoration-icons','mobile','construct','isoview','app','decorations','path-trace','project'])vm.runInContext(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8'),context,{filename:name+'.js'});
const run=code=>vm.runInContext(code,context);
for (const name of fs.readdirSync(path.join(root,'js')).filter(n=>n.endsWith('.js'))) new vm.Script(fs.readFileSync(path.join(root,'js',name),'utf8'),{filename:name});
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/desktop-v1.3.0.json')));
context.fixtures=fixtures;
for(const [name,sha] of Object.entries(fixtures.maps)){
 vm.runInContext(fs.readFileSync(path.join(root,'maps',name+'.js'),'utf8'),context);
 assert.equal(require('node:crypto').createHash('sha256').update(Buffer.from(context.window.TLC_MAPS_DATA[name].data,'base64')).digest('hex'),sha,name+' terrain differs from desktop');
}
function close(actual,expected,label){
 if(typeof expected==='number')assert.ok(Math.abs(actual-expected)<1e-6,`${label}: ${actual} != ${expected}`);
 else if(expected===null)assert.equal(actual,expected,label);
 else if(Array.isArray(expected)){assert.equal(actual.length,expected.length,label);expected.forEach((e,i)=>close(actual[i],e,label+' '+i));}
 else for(const [k,v] of Object.entries(expected))close(actual[k],v,label+' '+k);
}
for(const c of fixtures.geometry){
 context.c=c;const cps=run('constructCP(c.polygon.map(p=>makeCoordinate(...p)),null,{circuit:c.circuit,camberRate:0.15,maxCamberAngle:3})');
 close(cps,c.cps,'geometry');context.cps=cps;close(run('constructBank(cps)'),c.banks,'banks');
}
let entries=0;
for(const c of fixtures.decorations){
 context.c=c;
 const actual=run('constructDecorations(fixtures.banks,{sceneryindex:c.scenery},c.items)');
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),c.expected);entries+=actual.length;
 const bytes=Buffer.alloc(actual.length*24);
 actual.forEach((d,i)=>{const o=i*24;bytes.writeBigUInt64BE(BigInt(d.uuid),o);bytes.writeUInt32BE(d.rotation,o+8);bytes.writeFloatBE(d.vposIncludeHeight,o+12);bytes.writeFloatBE(d.vposIncludeHeight2,o+16);bytes.writeUInt32BE(d.tracktype,o+20);});
 assert.equal(bytes.toString('base64'),c.bytes);
}
for(const c of fixtures.gps){
 context.c=c;
 const actual=run('traceProjectedPath(projectPath(c.latlon),c.accuracy)');
 assert.equal(actual.circuit,c.circuit,c.name);
 assert.equal(actual.polygon.length,c.polygon.length,c.name);
 actual.polygon.forEach((p,i)=>['x','y','z','radius','camber','segments'].forEach((key,j)=>assert.ok(Math.abs(p[key]-c.polygon[i][j])<1e-6,`${c.name} ${i} ${key}`)));
}
// Full TED binary round trip, including right-side reversed cliff chains and unsigned UUIDs.
run(`polygon=[makeCoordinate(0,0,0,40,-1,1),makeCoordinate(1000,0,0,40,-1,1),makeCoordinate(1000,1000,0,40,-1,1),makeCoordinate(0,1000,0,40,-1,1)];
 S.sceneryindex=5; S.heightMap={coordToFraction:()=>0};
 decorations=[{type:9,uuid:'10477383456647924424',side:'right',track:'AB',vpos:500},{type:1,uuid:'13299451573148961480',side:'left',track:'A',vpos:1300}];
 const ted=constructTEDData(polygon,S); const buf=generateTedFile(ted); const parsed=new TEDTrackObject(buf,'test.ted');
 if(parsed.decorations.length!==4)throw new Error('Missing cliff entries');
 const restored=importDecorations(parsed);
 if(restored.length!==2||restored[0].uuid!==decorations[0].uuid)throw new Error('Cliff merge failed');
 const original=decorations; decorations=restored;
 const reexport=constructTEDData(polygon,S);
 for(let i=0;i<ted.decorations.length;i++){
  const a=ted.decorations[i],b=reexport.decorations[i];
  if(a.uuid!==b.uuid||a.rotation!==b.rotation||Math.abs(a.vposIncludeHeight-b.vposIncludeHeight)>0.001||Math.abs(a.vposIncludeHeight2-b.vposIncludeHeight2)>0.001)throw new Error('Decoration round trip changed');
 }
 const project=parseProjectFile(makeWebProject(S,polygon,original));
 if(JSON.stringify(project.decorations)!==JSON.stringify(original))throw new Error('Project lost decorations');
  const oldProject=JSON.parse(new TextDecoder().decode(makeWebProject(S,polygon,original)));
  oldProject.state.optimizeInteraction=true;
  if('optimizeInteraction' in parseProjectFile(new TextEncoder().encode(JSON.stringify(oldProject)).buffer).state)throw new Error('Old project enabled PDM');
 const legacy=parseProjectFile(makeTrk5(S,polygon));
 if(legacy.polygon.length!==polygon.length)throw new Error('TRK5 compatibility');
`);
// Unknown TED decoration UUID and rotation must survive import/export.
run(`const unknown={header:{sceneryindex:[0,0,0,5]},decorations:[{uuid:18446744073709551615n,rotation:4294967295,vposIncludeHeight:100,vposIncludeHeight2:180,tracktype:7}]};
 const u=importDecorations(unknown);const e=constructDecorations(fixtures.banks,{sceneryindex:5},u)[0];
 if(e.uuid!=='18446744073709551615'||e.rotation!==4294967295)throw new Error('Unknown model lost');`);
// Tilt must keep the horizontal spread and flatten elevation at top-down.
run(`const iso=Object.create(IsoView.prototype);Object.assign(iso,{rotation:0,scale:1,center:[0,0],zScale:4,zmin:0,elevation:Math.PI/6});
 const a=iso.proj([20,10,5]);iso.elevation=85*Math.PI/180;const b=iso.proj([20,10,5]);
 if(a[0]!==b[0]||b.some(v=>!Number.isFinite(v)))throw new Error('Invalid tilt projection');`);
console.log(`PASS: ${entries} desktop decoration records, ${fixtures.gps.length} GPS fixtures, ${fixtures.geometry.length} geometry/banking cases, all terrain payloads, TED/cliff round trips, project/TRK5 persistence, unknown UUIDs and tilt.`);
