"""r9: 사용자가 돌려준 피드백 PNG(빨강=면으로 추가, 지움=구멍)를 벡터 채움(*.fill.svg)에 반영한다.
 새 채움 = (제안 채움 ∪ 빨강영역) − 지운영역.  선 SVG(front.svg 등)와 원본 DWG는 건드리지 않는다.
 사용: python3 r9_fills.py <피드백폴더> <제안채움폴더(fills)> <미리보기폴더(previews)>"""
import sys,os,re,glob,json,asyncio,shutil
import numpy as np,cv2
from PIL import Image
from shapely.geometry import Polygon
from shapely.ops import unary_union
sys.path.insert(0,'/tmp/eng');import preview as P
from make_fills2 import to_path
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));SV=ROOT+'/assets/svg/';BK=ROOT+'/backup/r9-fills-before/'
fb,NF,PV=sys.argv[1:4]
def rings(d):
    out=[]
    for m in re.finditer(r'M([^MZ]*)Z',d):
        pts=[tuple(map(float,p.split())) for p in m.group(1).split('L') if p.strip()]
        if len(pts)>=3:out.append(pts)
    return out
def geom(svgtxt):
    g=Polygon()
    d=''.join(re.findall(r'<path[^>]* fill="#fff"[^>]* d="([^"]*)"',svgtxt)) or ''.join(re.findall(r'<path\b(?![^>]*class="o")[^>]* d="([^"]*)"',svgtxt))
    for r in rings(d):
        p=Polygon(r).buffer(0);g=g.symmetric_difference(p)
    return g.buffer(0)
def mask_to_geom(m,ox,oy,sc,up=4,eps=1.2):
    big=cv2.resize(m.astype(np.uint8)*255,None,fx=up,fy=up,interpolation=cv2.INTER_CUBIC)
    big=(big>127).astype(np.uint8)
    cs,h=cv2.findContours(big,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_NONE)
    polys=[]
    if h is None:return Polygon()
    h=h[0]
    for i,c in enumerate(cs):
        if h[i][3]!=-1:continue
        c=cv2.approxPolyDP(c,eps,True)[:,0,:]
        if len(c)<3:continue
        P0=Polygon([((x/up-ox)/sc,(y/up-oy)/sc) for x,y in c+0.5]).buffer(0)
        j=h[i][2]
        while j!=-1:
            cc=cv2.approxPolyDP(cs[j],eps,True)[:,0,:]
            if len(cc)>=3:P0=P0.difference(Polygon([((x/up-ox)/sc,(y/up-oy)/sc) for x,y in cc+0.5]).buffer(0))
            j=h[j][0]
        polys.append(P0)
    return unary_union(polys) if polys else Polygon()
async def main():
    from playwright.async_api import async_playwright
    rep=[]
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1100,'height':700})
        for f in sorted(glob.glob(fb+'/*.png')):
            n=os.path.basename(f)[:-4];a,v=n.split('__')
            if 'ornament-capital' in a or not os.path.isdir(SV+a):rep.append((a,v,'건너뜀(삭제된 에셋)',0,0,0));continue
            ol=open(SV+f'{a}/{v}.svg').read();nfp=f'{NF}/{a}/{v}.fill.svg'
            if not os.path.exists(nfp):rep.append((a,v,'제안 채움 없음',0,0,0));continue
            nf=open(nfp).read();of=open(SV+f'{a}/{v}.fill.svg').read() if os.path.exists(SV+f'{a}/{v}.fill.svg') else ''
            html='<html><body style="margin:0;background:transparent"><div style="padding:8px;font:700 14px sans-serif;color:#222">%s</div>%s%s</body></html>'%('x',P.svg(ol,of,'변경 전'),P.svg(ol,nf,'변경 후'))
            await pg.set_content(html)
            r=await pg.evaluate('()=>{const s=document.querySelectorAll("svg")[1].getBoundingClientRect();return [s.left+scrollX,s.top+scrollY,s.width,s.height]}')
            _,_,_,(w,h_)=(0,0,0,P.paths(ol)[3]);W=520;sc=(W-40)/max(w,h_);ox=r[0]+20;oy=r[1]+20
            U=np.array(Image.open(f).convert('RGBA')).astype(int);B=np.array(Image.open(f'{PV}/{n}.png').convert('RGBA')).astype(int)
            x0=int(r[0])-2;x1=int(r[0]+r[2])+2;y0=int(r[1])-2;y1=int(r[1]+r[3])+2
            sub=lambda z:z[y0:y1,x0:x1]
            u=sub(U);bb=sub(B)
            red=(u[...,0]>150)&(u[...,0]-u[...,1]>90)&(u[...,0]-u[...,2]>90)&(u[...,3]>60)
            er=(bb[...,3]>200)&(u[...,3]<40)
            k=np.ones((5,5),np.uint8)
            red=cv2.morphologyEx(red.astype(np.uint8),cv2.MORPH_CLOSE,k);red=cv2.dilate(red,np.ones((3,3),np.uint8))
            er=cv2.morphologyEx(er.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
            nr,lab,st,_=cv2.connectedComponentsWithStats(er);er2=np.zeros_like(er)
            for i in range(1,nr):
                if st[i,4]>=40:er2[lab==i]=1
            er2=cv2.dilate(er2,np.ones((3,3),np.uint8))
            nr,lab,st,_=cv2.connectedComponentsWithStats(red);red2=np.zeros_like(red)
            for i in range(1,nr):
                if st[i,4]>=25:red2[lab==i]=1
            G=geom(nf);note='제안 그대로(수정 없음)'
            ox2,oy2=ox-x0,oy-y0
            if red2.any():RG=mask_to_geom(red2,ox2,oy2,sc);RG=RG.buffer(-3.5).buffer(1.5);G=G.union(RG)   # 가는 가시(안티앨리어싱 번짐) 제거
            if er2.any():G=G.difference(mask_to_geom(er2,ox2,oy2,sc))
            if red2.any() or er2.any():note=f'빨강 {int(red2.sum())}px · 지움 {int(er2.sum())}px 반영'
            G=G.buffer(0)
            gs=[g for g in (G.geoms if hasattr(G,'geoms') else [G]) if g.area>4]
            d='';do=''
            for g_ in gs:
                g_=g_.simplify(0.05)
                for rr in [g_.exterior]+list(g_.interiors):d+=to_path(rr)
                do+=to_path(g_.exterior)
            vb=re.search(r'viewBox="([^"]*)"',ol)[1]
            svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"><path fill="#fff" fill-rule="evenodd" d="%s"/><path class="o" fill="none" d="%s"/></svg>\n'%(vb,d,do)
            if of:
                os.makedirs(BK+a,exist_ok=True)
                if not os.path.exists(BK+f'{a}/{v}.fill.svg'):shutil.copy(SV+f'{a}/{v}.fill.svg',BK+f'{a}/{v}.fill.svg')
            open(SV+f'{a}/{v}.fill.svg','w').write(svg)
            rep.append((a,v,note,int(red2.sum()),int(er2.sum()),round(G.area)))
        await b.close()
    json.dump(rep,open('/tmp/stage2/r9_fill_report.json','w'),ensure_ascii=False)
    for r in rep:print(*r)
asyncio.run(main())
