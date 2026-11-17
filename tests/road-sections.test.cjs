const assert=require('node:assert/strict'),fs=require('node:fs');
require('../js/road-types-data.js');const roads=require('../js/road-sections.js');
const bytes=new ArrayBuffer(244),v=new DataView(bytes);v.setBigUint64(0,0x4754365445440000n);v.setUint32(12,3);v.setUint32(132,156);v.setUint32(136,3);
for(let i=0;i<3;i++){v.setBigUint64(156+i*20,roads.NORMAL);v.setUint32(164+i*20,i===0?2:i===2?1:0);v.setFloat32(168+i*20,i*150);v.setFloat32(172+i*20,(i+1)*150);}
const changed=roads.replace(bytes,[1]);assert.equal(roads.read(changed).rows[1].uuid,roads.RESTAURANT);
for(let i=0;i<bytes.byteLength;i++)if(i<176||i>=184)assert.equal(new Uint8Array(bytes)[i],new Uint8Array(changed)[i]);
assert.deepEqual(roads.replace(changed,[1],false),bytes);assert.throws(()=>roads.replace(bytes,[0]));assert.throws(()=>roads.replace(bytes,[-1]));
const other=bytes.slice(0);new DataView(other).setUint32(12,2);assert.throws(()=>roads.replace(other,[1]));
assert.equal(roads.choices(3).length,5);assert.equal(roads.choices(2).length,2);assert.equal(roads.choices(1).length,4);
const medic=roads.replaceType(bytes,[2],0x93E20024E8474511n);assert.equal(roads.read(medic).rows[2].flag,1,'Existing Y orientation was changed');
const forest=roads.replaceType(other,[1],0xAF5B24BE050DCAC8n);assert.equal(roads.read(forest).rows[1].uuid,0xAF5B24BE050DCAC8n);
assert.throws(()=>roads.replaceType(bytes,[1],0xAF5B24BE050DCAC8n));assert.throws(()=>roads.replaceType(bytes,[1],roads.RESTAURANT,2));
if(process.argv[2]){const b=fs.readFileSync(process.argv[2]),a=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);const ids=roads.read(a).rows.filter(r=>r.uuid===roads.RESTAURANT).map(r=>r.index);assert.equal(ids.length,2);assert.deepEqual(roads.replace(roads.replace(a,ids,false),ids,true),a);console.log('PASS supplied TED: two restaurants, exact full-file restoration');}
console.log('PASS road section byte preservation, restoration, bounds, protected flags and scenery checks');
