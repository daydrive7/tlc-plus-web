"""Export the desktop's scenery-aware canvas icon drawings as SVG.

python tests/generate-decoration-icons.py "/path/to/Track Layout Creator +"
The v1.3.0 archive contains vector fallbacks, not the optional PNG sprites.
This executes that exact drawing function against an SVG canvas adapter.
"""
import ast, html, importlib, math, pathlib, sys
from types import SimpleNamespace

source = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(source))
dd = importlib.import_module('resources.decorationData')
tree = ast.parse((source/'TrackLayoutCreatorPlus.py').read_text(encoding='utf-8-sig'))
fn = next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='drawDecoSymbol')
env = dict(vars(math), tk=SimpleNamespace(ROUND='round'))
exec(compile(ast.Module(body=[fn],type_ignores=[]),'desktop icons','exec'),env)

def num(v): return f'{v:.4f}'.rstrip('0').rstrip('.')
class SVGCanvas:
    def __init__(self): self.items=[]
    def style(self,kw,line=False):
        fill=kw.get('fill','#000000') or 'none'
        stroke=fill if line else kw.get('outline','#000000') or 'none'
        attrs={'fill':'none' if line else fill,'stroke':stroke,'stroke-width':num(kw.get('width',1))}
        if kw.get('capstyle'):attrs['stroke-linecap']=kw['capstyle']
        if kw.get('joinstyle'):attrs['stroke-linejoin']=kw['joinstyle']
        if kw.get('dash'):attrs['stroke-dasharray']=' '.join(map(str,kw['dash']))
        return ' '.join(f'{k}="{html.escape(str(v))}"' for k,v in attrs.items())
    def create_line(self,*args,**kw):
        if len(args)==1:args=args[0]
        if kw.get('smooth') and len(args)>=6:
            self.items.append(f'<path d="{self.smooth_path(args,False)}" {self.style(kw,True)}/>');return
        pts=' '.join(f'{num(args[i])},{num(args[i+1])}' for i in range(0,len(args),2))
        self.items.append(f'<polyline points="{pts}" {self.style(kw,True)}/>')
    def create_polygon(self,*args,**kw):
        if len(args)==1:args=args[0]
        if kw.get('smooth'):
            self.items.append(f'<path d="{self.smooth_path(args,True)}" {self.style(kw)}/>');return
        pts=' '.join(f'{num(args[i])},{num(args[i+1])}' for i in range(0,len(args),2))
        self.items.append(f'<polygon points="{pts}" {self.style(kw)}/>')
    def smooth_path(self,args,closed):
        pts=list(zip(args[::2],args[1::2]))
        def point(p):return f'{num(p[0])} {num(p[1])}'
        def mid(a,b):return ((a[0]+b[0])/2,(a[1]+b[1])/2)
        if closed:
            d='M '+point(mid(pts[-1],pts[0]))
            for i,p in enumerate(pts):d+=' Q '+point(p)+' '+point(mid(p,pts[(i+1)%len(pts)]))
            return d+' Z'
        d='M '+point(pts[0])+' L '+point(mid(pts[0],pts[1]))
        for i in range(1,len(pts)-1):d+=' Q '+point(pts[i])+' '+point(mid(pts[i],pts[i+1]))
        return d+' L '+point(pts[-1])
    def create_oval(self,x0,y0,x1,y1,**kw):
        self.items.append(f'<ellipse cx="{num((x0+x1)/2)}" cy="{num((y0+y1)/2)}" rx="{num((x1-x0)/2)}" ry="{num((y1-y0)/2)}" {self.style(kw)}/>')
    def create_rectangle(self,x0,y0,x1,y1,**kw):
        self.items.append(f'<rect x="{num(x0)}" y="{num(y0)}" width="{num(x1-x0)}" height="{num(y1-y0)}" {self.style(kw)}/>')
    def create_arc(self,x0,y0,x1,y1,**kw):
        cx,cy=(x0+x1)/2,(y0+y1)/2;rx,ry=(x1-x0)/2,(y1-y0)/2
        a=math.radians(kw.get('start',0));b=a+math.radians(kw.get('extent',90))
        p=(cx+rx*math.cos(a),cy-ry*math.sin(a));q=(cx+rx*math.cos(b),cy-ry*math.sin(b))
        d=f'M {num(cx)} {num(cy)} L {num(p[0])} {num(p[1])} A {num(rx)} {num(ry)} 0 {int(abs(b-a)>math.pi)} {int(b<a)} {num(q[0])} {num(q[1])} Z'
        self.items.append(f'<path d="{d}" {self.style(kw)}/>')

out=pathlib.Path(__file__).resolve().parent.parent/'assets/decorations'
count=0
for scenery in dd.DECORATION_CATALOG:
    folder=out/f'sc{scenery:02}';folder.mkdir(parents=True,exist_ok=True)
    for type_id,(name,symbol,colour) in dict(dd.DECORATION_TYPE_INFO,unknown=('Unknown','dot','#AAAAAA')).items():
        if type_id==7 and scenery in (1,2,4,5):symbol='tent'
        name=dd.TYPE_NAME_OVERRIDE.get(scenery,{}).get(type_id,name)
        cv=SVGCanvas();env['drawDecoSymbol'](cv,symbol,32,32,23,colour,scenery=scenery)
        svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>'+html.escape(name)+'</title>'+''.join(cv.items)+'</svg>\n'
        (folder/(symbol+'.svg')).write_text(svg,encoding='utf-8');count+=1
print(f'Exported {count} desktop decoration icons across 5 scenery sets.')
