#!/usr/bin/env python3
"""벡터 방식 흰 면(가림·클릭 영역) 생성기 v2 — 래스터 flood-fill 을 쓰지 않는다.
선 SVG 의 선분·호를 정확한 좌표로 펼쳐(교차점에서 끊고) 닫힌 면(polygonize)을 구하고, 확실한 닫힌 면의 합집합만 흰 면으로 쓴다.
- 닫히지 않은 윤곽은 볼록 껍질로 메우지 않는다(원본에 없는 면 생성 금지) → 'open-outline' 으로 검수 표시
- 안쪽 닫힌 윤곽(도넛 후보)은 CAD 에 구멍 정보가 없으므로 임의로 파지 않고 'ring-hole?' 으로 검수 표시(면 위에 그린 원일 수 있음)
- CAD 의 실제 HATCH 구멍은 선 SVG 의 class="cf" 경로(evenodd)가 그대로 담당
출력: 기존과 같은 형식(<path fill="#fff" fill-rule="evenodd"> + <path class="o">) 의 .fill.svg + 검수 정보(dict)"""
import re,math
from shapely.geometry import LineString,Polygon,MultiPolygon
from shapely.ops import unary_union,polygonize
TOK=re.compile(r'([MLAaZz])([^MLAaZz]*)');NUM=re.compile(r'-?\d+\.?\d*(?:e-?\d+)?')
def arc_pts(x1,y1,r,large,sweep,x2,y2,n=None):
    """SVG 호(끝점 표기, rx=ry=r, 회전 0) → 점 목록(정확한 중심·각도 계산)"""
    dx,dy=(x1-x2)/2,(y1-y2)/2;d=math.hypot(dx,dy)
    if d<1e-9:return [(x2,y2)]
    if r<d:r=d
    sq=math.sqrt(max(0,(r*r-d*d)/(d*d)))*(-1 if large==sweep else 1)
    cx0,cy0=sq*dy,-sq*dx;cx,cy=cx0+(x1+x2)/2,cy0+(y1+y2)/2
    a1=math.atan2(y1-cy,x1-cx);a2=math.atan2(y2-cy,x2-cx);da=a2-a1
    if sweep and da<0:da+=2*math.pi
    if not sweep and da>0:da-=2*math.pi
    k=n or max(6,int(abs(da)/(math.pi/60))+1)
    return [(cx+r*math.cos(a1+da*i/k),cy+r*math.sin(a1+da*i/k)) for i in range(1,k+1)]
def parse_lines(d):
    out=[];cur=None;poly=[]
    def flush():
        nonlocal poly
        if len(poly)>1:out.append(poly)
        poly=[]
    for c,body in TOK.findall(d):
        n=[float(x) for x in NUM.findall(body)]
        if c=='M':
            flush();cur=(n[0],n[1]);poly=[cur]
            for i in range(2,len(n)-1,2):cur=(n[i],n[i+1]);poly.append(cur)
        elif c=='L':
            for i in range(0,len(n)-1,2):cur=(n[i],n[i+1]);poly.append(cur)
        elif c in 'Aa':
            for i in range(0,len(n)-6,7):
                r,_,_,lg,sw,x,y=n[i:i+7]
                if c=='a':x,y=cur[0]+x,cur[1]+y
                pts=arc_pts(cur[0],cur[1],r,int(lg),int(sw),x,y);poly.extend(pts);cur=(x,y)
    flush();return out
def silhouette(svg_text,snap=0.05):
    m=re.search(r'<path vector-effect="non-scaling-stroke" d="([^"]*)"',svg_text) or re.search(r'<path[^>]* d="([^"]*)"',svg_text)
    info={'review':[]}
    if not m:info['review'].append('no-lines');return None,None,info
    polys=parse_lines(m.group(1))
    R=lambda p:(round(p[0]/snap)*snap,round(p[1]/snap)*snap)
    lines=[LineString([R(p) for p in pl]) for pl in polys if len(pl)>1]
    lines=[l for l in lines if l.length>0]
    if not lines:info['review'].append('no-lines');return None,None,info
    noded=unary_union(lines)
    faces=[f for f in polygonize(noded) if f.area>0]
    if not faces:info['review'].append('open-outline');return None,None,info
    sil=unary_union(faces)
    # 닫히지 않은 선(끝점이 닫힌 면 경계 위에 없는 선)의 비율 → 윤곽이 열려 있는지
    bd=sil.boundary.buffer(snap*3);tot=sum(l.length for l in lines);inb=sum(l.intersection(sil.buffer(snap*3)).length for l in lines)
    info['line_in_sil']=round(inb/tot,3) if tot else 0
    if info['line_in_sil']<0.5:info['review'].append('open-outline')
    # 도넛 후보: 다른 닫힌 면 안에 완전히 들어 있고 그 안에 선이 없는 닫힌 면
    rings=0
    for f in faces:
        for h in f.interiors:
            p=Polygon(h)
            if p.length>0 and 4*math.pi*p.area/(p.length**2)>=0.85 and p.area>30:rings+=1   # 거의 원형인 안쪽 닫힌 윤곽
    if rings:info['review'].append('ring-hole?');info['rings']=rings
    geoms=list(sil.geoms) if isinstance(sil,MultiPolygon) else [sil]
    return geoms,info,info
def to_path(ring):
    c=list(ring.coords)[:-1]
    return 'M'+'L'.join('%.1f %.1f'%(x,y) for x,y in c)+'Z'
def fill_svg(svg_text):
    geoms,_,info=silhouette(svg_text)
    if not geoms:return None,info
    vb=re.search(r'viewBox="([^"]*)"',svg_text)[1]
    d='';do=''
    for g in geoms:
        if g.area<4:continue
        g=g.simplify(0.05)
        for r in [g.exterior]+list(g.interiors):d+=to_path(r)
        do+=to_path(g.exterior)
    if not d:return None,info
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"><path fill="#fff" fill-rule="evenodd" d="%s"/><path class="o" fill="none" d="%s"/></svg>\n'%(vb,d,do),info
if __name__=='__main__':
    import sys;t=open(sys.argv[1]).read();s,i=fill_svg(t);print(i,len(s or ''))
