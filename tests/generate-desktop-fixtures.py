"""Regenerate golden cases from an extracted official TLC+ v1.3.0 archive.

Usage: python tests/generate-desktop-fixtures.py "/path/to/Track Layout Creator +"
Requires the desktop dependencies (numpy and Pillow). Never starts its GUI.
"""
import ast, base64, hashlib, importlib, json, math, pathlib, struct, sys
from types import SimpleNamespace

source = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(source))
dd = importlib.import_module('resources.decorationData')
trace = importlib.import_module('resources.pathTraceService')
tree = ast.parse((source / 'TrackLayoutCreatorPlus.py').read_text(encoding='utf-8-sig'))
names = {'distToIncludeHeight', '_decoTracktype', 'construct_decorations', 'decoScenery', 'decoVariant', 'construct_cp', 'construct_bank'}
selected = ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])
env = dict(vars(math))
env.update(vars(importlib.import_module('resources.layoutClasses')))
env.update(vars(importlib.import_module('resources.layoutOperations')))
env.update({'dd':dd,'le':importlib.import_module('resources.layoutEuler'),'sceneryindex':SimpleNamespace(get=lambda:env['index']),
            'trackLength':SimpleNamespace(update=lambda cps:None),
            'cornerCount':SimpleNamespace(set=lambda n:None),'camberRate':SimpleNamespace(get=lambda:0.15),
            'maxCamberAngle':SimpleNamespace(get=lambda:3),'circuit':SimpleNamespace(get=lambda:env['closed'])})
exec(compile(selected,'desktop-v1.3.0','exec'),env)
banks = [dict(vlen=1200,vlen2d=1000,vpos2d=0,vpos3d=0,vlen3d=1200),
         dict(vlen=5500,vlen2d=5000,vpos2d=1000,vpos3d=1200,vlen3d=5500)]
decor_cases = []
for index,sc in dd.DECORATION_CATALOG.items():
    env['index']=index
    # Include every UUID, both sides and every track code, plus start-boundary cases.
    items=[]
    for j,v in enumerate(sc['variants']):
        for side in ['left','right']:
            for track in ['A','B','AB','CURB']:
                items.append(dict(type=v['type'],uuid=v['uuid'],side=side,track=track,vpos=200+j*40))
    items.append(dict(type=1,uuid=sc['variants'][0]['uuid'],side='left',track='AB',vpos=0))
    env['decorations']=items
    expected=env['construct_decorations'](banks)
    binary=b''.join(struct.pack('>QIffI',d['uuid'],d['rotation'],d['vposIncludeHeight'],d['vposIncludeHeight2'],d['tracktype']) for d in expected)
    for d in items+expected:d['uuid']=str(d['uuid'])
    decor_cases.append(dict(scenery=index,items=items,expected=expected,bytes=base64.b64encode(binary).decode()))

gps_cases=[]
paths={
    'circuit':[(50+0.003*math.sin(i*2*math.pi/120),7+0.004*math.cos(i*2*math.pi/120)) for i in range(121)],
    'stage':[(50+i*0.00015,7+0.002*math.sin(i/8)) for i in range(150)],
    'straight':[(50+i*0.0001,7) for i in range(40)],
    'duplicates':[(50+i*0.0002,7+0.001*math.sin(i/3)) for i in range(80) for _ in range(2)]
}
for name,path in paths.items():
    for accuracy in [50,75,100]:
        points,closed=trace.trace_path_to_track(path,accuracy)
        gps_cases.append(dict(name=name,accuracy=accuracy,latlon=path,polygon=[[p.x,p.y,p.z,p.radius,p.camber,p.segments] for p in points],circuit=closed))
geometry=[]
for closed in [True,False]:
    for segments in [0,1,3]:
        points=[[0,0,0,60,-1,segments],[900,0,15,120,-1,segments],[600,500,-10,80,2,segments],[100,600,0,60,-1,segments]]
        env['closed']=closed
        cps=env['construct_cp']([env['Coordinate'](*p) for p in points])
        expected=env['construct_bank'](cps)
        cpkeys=['x','y','x2','y2','formtype','radius','startAngle','sweepAngle','camber','camberFactor','z']
        geometry.append(dict(circuit=closed,polygon=points,cps=[{k:getattr(c,k) for k in cpkeys} for c in cps],banks=expected))
maps={}
for name in ['death_valley','eifel','andalusia','eifel_flat']:
    raw=(source/'resources/maps'/name).read_bytes()
    _,cols,rows=struct.unpack_from('<4xIII',raw,0x1020)
    maps[name]=hashlib.sha256(raw[0x1040:0x1040+cols*rows*2]).hexdigest()
out=pathlib.Path(__file__).parent/'fixtures/desktop-v1.3.0.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(dict(banks=banks,decorations=decor_cases,gps=gps_cases,geometry=geometry,maps=maps),separators=(',',':'))+'\n',encoding='utf-8')
print(f'Generated {len(decor_cases)} decoration and {len(gps_cases)} GPS reference cases.')
