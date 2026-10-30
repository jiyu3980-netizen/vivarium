#!/usr/bin/env python3
"""면(닫힌 영역) 번호 확인용: python3 faces.py <svg 상대경로> <출력 png> [최소면적px]
make_fills.py 와 같은 래스터/틈 닫기 결과에서 '바깥과 이어지지 않은 영역'에 번호를 붙여 PNG 로 저장하고,
각 번호의 시드점(뷰박스 대비 0~1 비율, 영역 안쪽 한 점)을 출력한다. fill_rules.json 의 exclude 에 쓸 좌표를 고르는 데 사용."""
import sys,os,re,cv2,numpy as np,json
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import make_fills as F
rel,out=sys.argv[1],sys.argv[2]
if '/' in rel and not rel.startswith('assets/'):
    aid,vk=rel.split('/');rel=json.load(open(F.ROOT+'/catalog/assets.json')) and [a for a in json.load(open(F.ROOT+'/catalog/assets.json'))['assets'] if a['assetId']==aid][0]['views'][vk]['svg'];minA=int(sys.argv[3]) if len(sys.argv)>3 else 40
svg=open(F.ROOT+'/'+rel).read();im,k,W,H,w=F.raster(svg)
ker=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13));cl=cv2.morphologyEx(im,cv2.MORPH_CLOSE,ker)
bg=(cl==0).astype(np.uint8);n,lab,st,cen=cv2.connectedComponentsWithStats(bg,connectivity=4)
outer=lab[0,0];vis=cv2.cvtColor(255-im,cv2.COLOR_GRAY2BGR);rng=np.random.RandomState(3);res=[]
for i in range(1,n):
    if i==outer or st[i,4]<minA:continue
    m=(lab==i).astype(np.uint8);dt=cv2.distanceTransform(m,cv2.DIST_L2,3);y,x=np.unravel_index(dt.argmax(),dt.shape)
    col=[int(c) for c in rng.randint(80,230,3)];vis[lab==i]=(0.55*vis[lab==i]+0.45*np.array(col)).astype(np.uint8)
    res.append((len(res)+1,i,(x-F.PAD)/k/W,(y-F.PAD)/k/H,int(st[i,4]),(x,y)))
for num,i,fx,fy,a,(x,y) in res:cv2.putText(vis,str(num),(int(x)-6,int(y)+4),cv2.FONT_HERSHEY_SIMPLEX,0.45,(0,0,0),1,cv2.LINE_AA)
cv2.imwrite(out,vis)
for num,i,fx,fy,a,_ in res:print(num,round(fx,4),round(fy,4),a)

if len(sys.argv)>4 and sys.argv[4]=='save':pass
