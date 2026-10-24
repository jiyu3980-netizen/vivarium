#!/usr/bin/env python3
"""front/leftSide/rightSide 선 SVG → 외곽 실루엣(흰 채움) SVG (*.fill.svg). 선 SVG 자체는 수정하지 않는다.
방법: 선을 저해상도로 래스터화 → 미세 틈 닫기 → 바깥에서 flood-fill → 닫힌 영역 내부를 채움(다리 사이처럼 열린 공간은 비움) → 윤곽 벡터화.
catalog/assets.json 의 각 뷰에 'fill' 경로를 추가한다."""
import json,os,re,cv2,numpy as np,sys
from multiprocessing import Pool
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAD=16
RULES_PATH=ROOT+'/catalog/fill_rules.json'
RULES=json.load(open(RULES_PATH)) if os.path.exists(RULES_PATH) else {}
R=800  # 긴 변 해상도(부드러운 윤곽을 위해 400→800)
TOK=re.compile(r'([MLAa])([^MLAa]*)');NUM=re.compile(r'-?\d+\.?\d*(?:e-?\d+)?')
def raster(svg):
    m=re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"',svg);W,H=float(m[1]),float(m[2]);k=R/max(W,H);w,h=int(W*k)+2*PAD,int(H*k)+2*PAD
    im=np.zeros((h,w),np.uint8);d=re.search(r' d="([^"]*)"',svg)
    if not d:return None,0,0,0,0
    cur=None;start=None;P=lambda x,y:(int(round(x*k))+PAD,int(round(y*k))+PAD);poly=[]
    def flush():
        nonlocal poly
        if len(poly)>1:cv2.polylines(im,[np.array(poly,np.int32)],False,255,3,cv2.LINE_8)
        poly=[]
    for c,body in TOK.findall(d[1]):
        n=[float(x) for x in NUM.findall(body)]
        if c=='M':
            flush()
            # 첫 좌표쌍 = M, 이후 쌍은 L 로 이어짐 (extract.mjs 형식: M x y L x y …)
            cur=(n[0],n[1]);poly=[P(*cur)]
            for i in range(2,len(n)-1,2):cur=(n[i],n[i+1]);poly.append(P(*cur))
        elif c=='L':
            for i in range(0,len(n)-1,2):cur=(n[i],n[i+1]);poly.append(P(*cur))
        elif c=='A':
            for i in range(0,len(n)-6,7):cur=(n[i+5],n[i+6]);poly.append(P(*cur))
        elif c=='a':
            for i in range(0,len(n)-6,7):
                if cur:cur=(cur[0]+n[i+5],cur[1]+n[i+6]);poly.append(P(*cur))
    flush();return im,k,W,H,w
def work(args):
    rel,out,rules=args
    try:
        svg=open(ROOT+'/'+rel).read();im,k,W,H,w=raster(svg)
        if im is None:return rel,None
        ker=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5) if (rules or {}).get('fine') else (13,13));cl=cv2.morphologyEx(im,cv2.MORPH_CLOSE,ker)
        ff=cl.copy();mask=np.zeros((ff.shape[0]+2,ff.shape[1]+2),np.uint8);cv2.floodFill(ff,mask,(0,0),128)
        filled=np.where(ff==128,0,255).astype(np.uint8)  # 바깥이 아닌 모든 곳
        if rules:   # 사용자 지정: 채우지 않을 면(exclude, 시드점이 속한 닫힌 영역) / 강제로 채울 곳(include, 작은 원)
            bgm=(cl==0).astype(np.uint8);nl,lab=cv2.connectedComponents(bgm,connectivity=4)
            for fx,fy in rules.get('exclude',[]):
                x=int(round(fx*W*k))+PAD;y=int(round(fy*H*k))+PAD
                if 0<=y<lab.shape[0] and 0<=x<lab.shape[1] and lab[y,x]!=0 and lab[y,x]!=lab[0,0]:filled[lab==lab[y,x]]=0
            for fx,fy,r in rules.get('include',[]):
                cv2.circle(filled,(int(round(fx*W*k))+PAD,int(round(fy*H*k))+PAD),int(r),255,-1)
        filled=cv2.erode(filled,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
        # 윤곽 다듬기: 가우시안 블러 후 재이진화(계단·잔 요철 제거, 모서리 위치는 유지) → 윤곽 좌표 이동평균
        filled=cv2.threshold(cv2.GaussianBlur(filled,(0,0),0.8 if (rules or {}).get('fine') else 2.2),127,255,cv2.THRESH_BINARY)[1]
        cs,hier=cv2.findContours(filled,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_NONE)
        def smooth(c,win=5):
            p=c[:,0,:].astype(np.float32)
            if len(p)<3*win:return p
            k=np.ones(win)/win;pad=np.concatenate([p[-win:],p,p[:win]])
            x=np.convolve(pad[:,0],k,'same')[win:-win];y=np.convolve(pad[:,1],k,'same')[win:-win];return np.stack([x,y],1).astype(np.float32)
        def path(p):
            a=cv2.approxPolyDP(p.reshape(-1,1,2),0.6,True)[:,0,:]
            return 'M'+'L'.join('%.1f %.1f'%((x-PAD)/k,(y-PAD)/k) for x,y in a)+'Z'
        d='';do=''
        for i,c in enumerate(cs):
            if cv2.contourArea(c)<20:continue
            pth=path(c[:,0,:].astype(np.float32) if (rules or {}).get('fine') else smooth(c));d+=pth
            if hier[0][i][3]==-1:do+=pth   # 바깥 윤곽만(구멍 제외) → 편집기에서 외곽선 stroke 로 사용
        if not d:return rel,None
        vb=re.search(r'viewBox="([^"]*)"',svg)[1]
        open(ROOT+'/'+out,'w').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"><path fill="#fff" fill-rule="evenodd" d="%s"/><path class="o" fill="none" d="%s"/></svg>\n'%(vb,d,do))
        return rel,out
    except Exception as e:
        import traceback;traceback.print_exc();return rel,None
def rules_for(a,k,v):
    r=RULES.get(a['assetId']+'/'+k)
    if r:return r
    src=(v.get('derived') or {}).get('mirroredFrom')
    r=RULES.get(a['assetId']+'/'+src) if src else None
    if r:return {'exclude':[[1-x,y] for x,y in r.get('exclude',[])],'include':[[1-x,y,rr] for x,y,rr in r.get('include',[])],'fine':r.get('fine',False)}
    return None
if __name__=='__main__':
    J=json.load(open(ROOT+'/catalog/assets.json'));jobs=[]
    for a in J['assets']:
        for k in ('front','leftSide','rightSide'):
            v=a['views'].get(k)
            if v:jobs.append((v['svg'],v['svg'].replace('.svg','.fill.svg'),rules_for(a,k,v)))
    with Pool(4) as p:res=dict(p.map(work,jobs,chunksize=8))
    n=0
    for a in J['assets']:
        for k in ('front','leftSide','rightSide'):
            v=a['views'].get(k)
            if v:
                v['fill']=res.get(v['svg']);n+=1 if v['fill'] else 0
    json.dump(J,open(ROOT+'/catalog/assets.json','w'),ensure_ascii=False,indent=1)
    print('fills',n,'/',len(jobs))
