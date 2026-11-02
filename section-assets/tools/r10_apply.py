"""r10 (2026-11-02): 사용자가 xlsx 로 지정한 삭제(X)·이동·이름 수정 반영. 원본 DWG 는 건드리지 않음.
staircase-glass-railing 은 편집기 '계단 > 유리 난간' 종류가 쓰는 에셋이라 삭제하지 않음(보고에 표시)."""
import json,os,shutil
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));P=lambda *a:os.path.join(ROOT,*a)
M=json.load(open('/tmp/user_marks.json'))
KEEP={'staircase-glass-railing':'편집기 계단(유리 난간)이 쓰는 에셋이라 삭제 보류'}
J=json.load(open(P('catalog/assets.json')));A=J['assets'];BY={a['assetId']:a for a in A};LOG=[]
dele=[]
for aid,nm,_ in M['X']:
    if aid in KEEP:LOG.append(f'보류: {aid} ({nm}) — {KEEP[aid]}');continue
    if aid not in BY:LOG.append(f'(없음) {aid}');continue
    dele.append(aid)
for i in dele:
    d=P('assets/svg',i)
    if os.path.isdir(d):shutil.rmtree(d)
    t=P('assets/thumbs',i+'.png')
    if os.path.exists(t):os.remove(t)
    LOG.append(f'삭제: {i} ({BY[i]["nameKo"]})')
A=[a for a in A if a['assetId'] not in dele];BY={a['assetId']:a for a in A}
def edit(i,cat=None,sub=None,name=None):
    a=BY[i];o=(a['categoryId'],a['subcategoryId'],a['nameKo'])
    if cat:a['categoryId']=cat
    if sub:a['subcategoryId']=sub
    if name:a['nameKo']=name
    if a['categoryId']!='furniture':a.pop('tab',None)
    LOG.append(f'수정: {i} {o} → ({a["categoryId"]},{a["subcategoryId"]},{a["nameKo"]})')
edit('crockery-unit','kitchen','kitchen-sink')
edit('coffee-paper-cup',name='일회용컵');edit('dish-rack',name='식기 렉')
edit('hydrorail','bathroom','bathroom-accessory','샤워기 헤드')
edit('log-store-shed',name='장작 창고');edit('water-well',name='우물')
J['assets']=A;J['count']=len(A)
json.dump(J,open(P('catalog/assets.json'),'w'),ensure_ascii=False,indent=1)
open(P('logs/r10-changes.md'),'w').write('\n'.join(LOG)+'\n');print('\n'.join(LOG[:3]),'...',len(dele),'deleted',len(A),'left')
