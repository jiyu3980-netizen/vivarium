#!/usr/bin/env python3
"""7차 기존 에셋 수정(선 데이터는 '삭제/회전/복사'만, 변형 없음). 원본 DWG 는 읽지 않는다. 한 번만 실행(멱등 아님)."""
import os,sys,json,shutil,copy
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import r7_apply as R
T=R.T;P=R.P;SV=R.SV;LOG=[];A=R.A;BY=R.BY
def log(s):LOG.append(s);print(s)
def bb(s):
    xs=[p[1] if p[0] in 'ML' else p[-2] for p in s];ys=[p[2] if p[0] in 'ML' else p[-1] for p in s];return min(xs),min(ys),max(xs),max(ys)
def remirror(a):
    for dk,d in list(a['views'].items()):
        if d and d.get('derived'):
            sk=d['derived']['mirroredFrom'];e=a['views'][sk];vb,subs=T.load(P(e['svg']));W,H=R.vbwh(e['viewBox'])
            R.write_view(d['svg'],T.mirror_x(subs,W),bbox=(0,0,W,H),norm=False)
            d.update(viewBox=e['viewBox'],widthUnits=e['widthUnits'],heightUnits=e['heightUnits'],aspect=e['aspect'],segments=e['segments']);d.pop('fill',None)
def remove_subs(aid,key,pred,label):
    a=BY[aid];e=a['views'][key];vb,subs=T.load(P(e['svg']))
    keep=[s for s in subs if not pred(bb(s))];n=len(subs)-len(keep)
    if not n:log(f'(변화 없음) {aid}/{key}');return
    u=R.upn(e);vbs,k,(x0,y0,w,h),_=R.write_view(e['svg'],keep)
    e.update(viewBox=vbs,widthUnits=round(w*u,3),heightUnits=round(h*u,3),aspect=round(w/h,4),segments=R.nseg(keep));e.pop('fill',None)
    e['edited']=label;remirror(a);R.size_cm(a);R.fix_reasons(a);R.restatus(a);log(f'선 삭제: {aid}/{key}: {label} ({n}개 경로)')
def rot_ccw(subs,W,H):
    for _ in range(3):
        subs=T.rotate_cw90(subs,H);W,H=H,W
    return subs,W,H
def front_from(aid,src_group,src_key,rot=False,note=''):
    a=BY[aid];e=(a['views'] if src_group=='views' else a['extraViews'])[src_key]
    vb,subs=T.load(P(e['svg']));W,H=R.vbwh(e['viewBox']);rel=f'{SV}{aid}/front.svg';os.makedirs(os.path.dirname(P(rel)),exist_ok=True)
    shutil.copy(P(e['svg']),P(rel));d=dict(e);d['svg']=rel;d.pop('fill',None);d['anchor']=dict(x=0.5,y=1.0,note='바닥 접지점=하단 중앙');d['derived']=dict(copiedFrom=src_key,note=note)
    d['sourceBlock']=f"{e['sourceBlock']} ({note})";a['views']['front']=d;return a
# 1) 벽난로 4 삭제
if 'fireplaces-4' in BY:
    R.rm_dir('fireplaces-4');A[:]=[x for x in A if x['assetId']!='fireplaces-4'];del BY['fireplaces-4'];log('삭제: fireplaces-4 (벽난로 4) — 카탈로그 항목과 SVG 폴더 삭제(원본 DWG는 그대로)')
# 2) 소프트 시팅 분리
R.split_asset('peeps-soft-seating',{});
for i,nm in ((1,'소프트 시팅 1인 의자'),(2,'소프트 시팅 2인 소파')):
    a=BY.get(f'peeps-soft-seating-{i}')
    if a:a['nameKo']=nm;a['tags']=list(dict.fromkeys([nm]+a['tags']))
# 3) 상업용 식기세척기: 본체 왼쪽 떨어진 선
remove_subs('commercial-dishwasher-with-tables','front',lambda b:b[2]<100,'본체에서 멀리 떨어진 왼쪽 선 제거')
# 4) 트롤리 테이블 1: 좌우 기둥(빨간 영역) 제거
remove_subs('trolley-table-1','front',lambda b:b[2]<=125 or b[0]>=875,'좌우 기둥(손잡이·바퀴 포함) 선 제거')
# 5) 바이올린: 정면(세워 둔 모습) = DWG 평면 블록, 측면 = DWG 측면 블록을 세워서
a=BY['violin'];e=a['views']['leftSide'];vb,subs=T.load(P(e['svg']));W,H=R.vbwh(e['viewBox'])
rs,W2,H2=rot_ccw(subs,W,H);rel=f'{SV}violin/leftSide.svg';R.write_view(rel,rs,bbox=(0,0,W2,H2),norm=False)
u=R.upn(e);e.update(svg=rel,viewBox=f'0 0 {W2:g} {H2:g}',widthUnits=e['heightUnits'],heightUnits=e['widthUnits']);e['aspect']=round(e['widthUnits']/e['heightUnits'],4);e['rotatedCCW90']=True;e.pop('fill',None)
remirror(a);front_from('violin','extraViews','top',note='세워 둔 바이올린을 정면에서 본 모습 = DWG 평면 블록')
a['reviewReasons']=[x for x in a['reviewReasons'] if x not in('missing-front',)];R.size_cm(a);R.restatus(a)
log('재구성: violin — 정면=DWG 평면 블록(세워 둔 모습), 측면=DWG 측면 블록을 세워서(반시계 90°)')
# 6) 체스 보드: 정면=DWG 측면 블록(말이 서 있는 모습), 단위 인치
a=BY['chess-board'];front_from('chess-board','views','leftSide',note='DWG 측면 블록을 정면으로도 사용');R.resize_full(a,2.54);R.fix_reasons(a);R.restatus(a)
a['reviewReasons']=[x for x in a['reviewReasons'] if x!='missing-front']
log(f"재구성: chess-board — 정면=DWG 측면 블록, 크기 단위 인치(×2.54) → {a['defaultSizeCm']}")
R.J['assets']=A;R.J['count']=len(A);json.dump(R.J,open(R.CAT,'w'),ensure_ascii=False,indent=1)
open(R.ROOT+'/logs/r7-changes.md','a').write('\n## 기존 에셋 수정\n'+'\n'.join('- '+l for l in LOG)+'\n')
print('saved',len(A))
