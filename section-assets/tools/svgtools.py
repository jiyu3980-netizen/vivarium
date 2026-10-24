#!/usr/bin/env python3
"""가구 뷰 SVG(M/L/A 경로만 사용)를 읽고·묶고·변환·저장하는 공통 도구.
좌표는 '긴 변=1000' 정규화 좌표. 선 정보는 변형하지 않고 그대로 옮긴다(미러/회전/자르기만)."""
import re,math

HEAD_RX=re.compile(r'<svg[^>]*viewBox="([^"]+)"')
PATH_RX=re.compile(r'<path[^>]* d="([^"]*)"')
TOK=re.compile(r'([MLAalmHhVvZz])|(-?\d*\.?\d+(?:e-?\d+)?)')

def parse_d(d):
    """→ subpaths: [ [ ('M',x,y), ('L',x,y), ('A',rx,ry,rot,large,sweep,x,y), ... ], ... ] (절대좌표)"""
    toks=[(m.group(1),m.group(2)) for m in TOK.finditer(d)]
    subs=[];cur=None;i=0;x=y=0.0;cmd=None
    def num():
        nonlocal i
        v=float(toks[i][1]);i+=1;return v
    while i<len(toks):
        c,n=toks[i]
        if c:cmd=c;i+=1
        if cmd in('M','m'):
            nx,ny=num(),num()
            if cmd=='m':nx+=x;ny+=y
            x,y=nx,ny;cur=[('M',x,y)];subs.append(cur);cmd='L' if cmd=='M' else 'l'
        elif cmd in('L','l'):
            nx,ny=num(),num()
            if cmd=='l':nx+=x;ny+=y
            x,y=nx,ny;cur.append(('L',x,y))
        elif cmd in('A','a'):
            rx,ry,rot,lg,sw,nx,ny=[num() for _ in range(7)]
            if cmd=='a':nx+=x;ny+=y
            x,y=nx,ny;cur.append(('A',rx,ry,rot,int(lg),int(sw),x,y))
        elif cmd in('Z','z'):
            pass
        else:
            raise ValueError('cmd '+str(cmd))
    return subs

def arc_points(x1,y1,rx,ry,rot,lg,sw,x2,y2,n=24):
    """SVG 호 → 점열(끝점 포함, 시작점 제외)"""
    if rx==0 or ry==0:return [(x2,y2)]
    phi=math.radians(rot);c,s=math.cos(phi),math.sin(phi)
    dx,dy=(x1-x2)/2,(y1-y2)/2
    x1p=c*dx+s*dy;y1p=-s*dx+c*dy
    rx,ry=abs(rx),abs(ry)
    lam=x1p**2/rx**2+y1p**2/ry**2
    if lam>1:rx*=math.sqrt(lam);ry*=math.sqrt(lam)
    num=rx*rx*ry*ry-rx*rx*y1p*y1p-ry*ry*x1p*x1p
    den=rx*rx*y1p*y1p+ry*ry*x1p*x1p
    co=math.sqrt(max(0,num/den)) if den else 0
    if lg==sw:co=-co
    cxp=co*rx*y1p/ry;cyp=-co*ry*x1p/rx
    cx=c*cxp-s*cyp+(x1+x2)/2;cy=s*cxp+c*cyp+(y1+y2)/2
    def ang(ux,uy,vx,vy):
        a=math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);return a
    t1=ang(1,0,(x1p-cxp)/rx,(y1p-cyp)/ry)
    dt=ang((x1p-cxp)/rx,(y1p-cyp)/ry,(-x1p-cxp)/rx,(-y1p-cyp)/ry)
    if not sw and dt>0:dt-=2*math.pi
    if sw and dt<0:dt+=2*math.pi
    pts=[]
    for k in range(1,n+1):
        t=t1+dt*k/n;ex=rx*math.cos(t);ey=ry*math.sin(t)
        pts.append((c*ex-s*ey+cx,s*ex+c*ey+cy))
    pts[-1]=(x2,y2);return pts

def sub_points(sub):
    pts=[(sub[0][1],sub[0][2])]
    for seg in sub[1:]:
        if seg[0]=='L':pts.append((seg[1],seg[2]))
        else:
            px,py=pts[-1];pts+=arc_points(px,py,*seg[1:])
    return pts

def sub_bbox(sub):
    p=sub_points(sub);xs=[a for a,b in p];ys=[b for a,b in p]
    return min(xs),min(ys),max(xs),max(ys)

def load(path):
    s=open(path,encoding='utf-8').read()
    vb=[float(v) for v in HEAD_RX.search(s).group(1).split()]
    subs=[]
    for d in PATH_RX.findall(s):subs+=parse_d(d)
    return vb,subs

def f(v):
    t=('%.2f'%v).rstrip('0').rstrip('.')
    return '0' if t in('-0','') else t

def sub_d(sub):
    o=[]
    for seg in sub:
        if seg[0]=='M':o.append('M%s %s'%(f(seg[1]),f(seg[2])))
        elif seg[0]=='L':o.append('L%s %s'%(f(seg[1]),f(seg[2])))
        else:o.append('A%s %s %s %d %d %s %s'%(f(seg[1]),f(seg[2]),f(seg[3]),seg[4],seg[5],f(seg[6]),f(seg[7])))
    return ''.join(o)

def write_svg(path,subs,bbox=None,pad=0.0,norm=True,long=1000.0,width_height_attrs=False):
    """subs를 긴 변=1000 으로 다시 정규화해 저장. bbox 없으면 subs 전체 bbox. → (viewBox, scale, (minx,miny,w,h))"""
    if bbox is None:
        bb=[sub_bbox(s) for s in subs]
        bbox=(min(b[0] for b in bb),min(b[1] for b in bb),max(b[2] for b in bb),max(b[3] for b in bb))
    x0,y0,x1,y1=bbox;w=x1-x0;h=y1-y0
    k=long/max(w,h) if norm else 1.0
    out=[]
    for sub in subs:
        o=[]
        for seg in sub:
            if seg[0]=='A':
                o.append(('A',seg[1]*k,seg[2]*k,seg[3],seg[4],seg[5],(seg[6]-x0)*k,(seg[7]-y0)*k))
            else:o.append((seg[0],(seg[1]-x0)*k,(seg[2]-y0)*k))
        out.append(o)
    W=w*k;H=h*k
    d=''.join(sub_d(s) for s in out)
    svg=('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" width="%s" height="%s">'%(f(W),f(H),f(W),f(H))+
         '<g fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">'
         '<path vector-effect="non-scaling-stroke" d="%s"/></g></svg>'%d)
    open(path,'w',encoding='utf-8').write(svg)
    return '0 0 %s %s'%(f(W),f(H)),k,(x0,y0,w,h),(W,H)

# ---- 변환 -------------------------------------------------------------
def map_subs(subs,fn):
    """fn(x,y)->(x',y') 을 모든 좌표에 적용. 호(A)는 mirror/rot에 맞게 sweep·rotation 보정을 호출측 fn 메타로"""
    raise NotImplementedError

def mirror_x(subs,W):
    out=[]
    for sub in subs:
        o=[]
        for seg in sub:
            if seg[0]=='A':o.append(('A',seg[1],seg[2],(-seg[3])%360,seg[4],1-seg[5],W-seg[6],seg[7]))
            else:o.append((seg[0],W-seg[1],seg[2]))
        out.append(o)
    return out

def rotate_cw90(subs,H):
    """시계방향 90°: (x,y)→(H-y, x). 호의 회전각 +90, sweep 유지(회전은 방향 보존)."""
    out=[]
    for sub in subs:
        o=[]
        for seg in sub:
            if seg[0]=='A':o.append(('A',seg[1],seg[2],(seg[3]+90)%360,seg[4],seg[5],H-seg[7],seg[6]))
            else:o.append((seg[0],H-seg[2],seg[1]))
        out.append(o)
    return out

# ---- 클러스터 -----------------------------------------------------------
def clusters(subs,gap=6.0):
    """bbox 를 gap 만큼 부풀려 겹치면 하나로. → [ [sub index,...], ... ]"""
    bb=[sub_bbox(s) for s in subs];n=len(subs);par=list(range(n))
    def fnd(a):
        while par[a]!=a:par[a]=par[par[a]];a=par[a]
        return a
    order=sorted(range(n),key=lambda i:bb[i][0])
    act=[]
    for i in order:
        x0,y0,x1,y1=bb[i]
        act=[j for j in act if bb[j][2]+gap>=x0]
        for j in act:
            b=bb[j]
            if b[1]-gap<=y1 and b[3]+gap>=y0:
                a,c=fnd(i),fnd(j)
                if a!=c:par[a]=c
        act.append(i)
    g={}
    for i in range(n):g.setdefault(fnd(i),[]).append(i)
    return list(g.values())

def cl_bbox(subs,idx):
    bb=[sub_bbox(subs[i]) for i in idx]
    return min(b[0] for b in bb),min(b[1] for b in bb),max(b[2] for b in bb),max(b[3] for b in bb)
