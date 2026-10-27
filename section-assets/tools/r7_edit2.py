#!/usr/bin/env python3
"""7차 추가 수정: 아침식사 트레이(breakfast-tray) 정면의 좌우 기둥(사용자가 빨간 테두리로 표시)을 선분 단위로 삭제.
선은 변형하지 않고, 기둥에 해당하는 선분만 지운다."""
import os,sys,json
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import r7_apply as R
T=R.T;P=R.P;A=R.A;BY=R.BY
a=BY['breakfast-tray'];e=a['views']['front'];vb,subs=T.load(P(e['svg']))
def pts(s):return [(p[-2],p[-1]) for p in s]
def inpost(x,y):return (x<=25.6 or x>=974.4)
keep=[];cut=0
for s in subs:
    pp=[(p[0],p[-2],p[-1]) for p in s]
    # 호('A')가 없는 단순 폴리라인만 선분 단위로 처리(이 파일은 모두 M/L)
    assert all(p[0] in 'ML' for p in s)
    cur=None
    for i in range(1,len(pp)):
        (_,x0,y0),(_,x1,y1)=pp[i-1],pp[i]
        if inpost(x0,y0) and inpost(x1,y1) and not (233.4<=min(y0,y1) and max(y0,y1)<=298.2):cut+=1;cur=None;continue
        if cur is None:cur=[('M',x0,y0)];keep.append(cur)
        cur.append(('L',x1,y1))
print('cut segments',cut,'subpaths',len(subs),'->',len(keep))
u=R.upn(e);vbs,k,(x0,y0,w,h),_=R.write_view(e['svg'],keep)
e.update(viewBox=vbs,widthUnits=round(w*u,3),heightUnits=round(h*u,3),aspect=round(w/h,4),segments=R.nseg(keep));e.pop('fill',None);e['edited']='좌우 기둥 선 제거(사용자 지정 영역)'
R.size_cm(a);R.fix_reasons(a);R.restatus(a)
# 측면 뷰는 변경 없음. 저장
R.J['assets']=A;json.dump(R.J,open(R.CAT,'w'),ensure_ascii=False,indent=1)
open(R.ROOT+'/logs/r7-changes.md','a').write(f'- 선 삭제: breakfast-tray/front: 좌우 기둥 선분 {cut}개 제거 → 기본 크기 {a["defaultSizeCm"]}\n')
print(a['defaultSizeCm'])
