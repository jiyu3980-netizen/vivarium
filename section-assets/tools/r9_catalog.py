"""r9 (2026-11-01): 기둥머리 장식 전면 삭제 + 카테고리 이동 + 가구 소분류 탭(tab) 부여.
subcategoryId 는 sim.js(행동 분류)가 쓰므로 그대로 두고, 가구 탭용 `tab` 필드를 새로 둔다."""
import json,os,re,shutil
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P=lambda *a:os.path.join(ROOT,*a)
J=json.load(open(P('catalog/assets.json')));A=J['assets'];BY={a['assetId']:a for a in A};LOG=[]
log=LOG.append
# 1) 삭제
dele=[a['assetId'] for a in A if re.search(r'ornament-capital',a['assetId'],re.I) or '기둥머리 장식' in a['nameKo']]
for i in dele:
    for p in (P('assets/svg',i),):
        if os.path.isdir(p):shutil.rmtree(p)
    t=P('assets/thumbs',i+'.png')
    if os.path.exists(t):os.remove(t)
    log(f'삭제: {i} ({BY[i]["nameKo"]}) — 카탈로그·SVG·썸네일 삭제')
A=[a for a in A if a['assetId'] not in dele];BY={a['assetId']:a for a in A}
# 2) 카테고리 이동
def mv(i,cat,sub=None,why=''):
    a=BY.get(i)
    if not a:log(f'(없음) {i}');return
    o=(a['categoryId'],a['subcategoryId']);a['categoryId']=cat
    if sub:a['subcategoryId']=sub
    log(f'이동: {i} ({a["nameKo"]}) {o[0]}/{o[1]} → {a["categoryId"]}/{a["subcategoryId"]} {why}')
COOK=['rice-cooker','air-fryer','ikea-microwave-lagan','smeg-toaster','waffle-iron','kitchenaid-blender','kitchenaid-mixer','juicer']
for i in COOK:mv(i,'kitchen',why='조리기구(가전 탭 → 주방)')
for i in ['kitchen-shelf-1','kitchen-shelf-2','kitchen-shelf-3','kitchen-shelf-4']:mv(i,'kitchen',why='주방 선반(수납 → 주방)')
BOOK=[a['assetId'] for a in A if a['categoryId']=='storage-lifestyle' and a['subcategoryId']=='shelf' and re.search(r'책장|bookshel|bookcase|book-shelf',a['nameKo']+a['assetId'],re.I)]
for i in BOOK:mv(i,'furniture',why='책장(수납 → 가구)')
mv('mosquito-net','furniture',why='블라인드·커튼 → 가구(침대 탭)')
# 3) 가구 탭
TAB={'chair':'seating','sofa':'seating','desk':'table','dining-table':'table','side-table-bench':'table','bed':'bed','cabinet':'storage','fireplace':'fireplace','shelf':'bookshelf'}
for a in A:
    if a['categoryId']!='furniture':a.pop('tab',None);continue
    t=TAB.get(a['subcategoryId'],'etc')
    s=a['assetId']+' '+a['nameKo']
    if a['subcategoryId']=='side-table-bench' and re.search(r'bedside|침대 옆|협탁',s):t='storage'
    if re.search(r'hammock|해먹|baby-bed|아기 침대|mosquito|crib',s):t='bed'
    a['tab']=t
import collections;log('가구 탭 집계: '+str(dict(collections.Counter(a['tab'] for a in A if a['categoryId']=='furniture'))))
J['assets']=A;J['count']=len(A)
json.dump(J,open(P('catalog/assets.json'),'w'),ensure_ascii=False,indent=1)
C=json.load(open(P('catalog/category-config.json')))
for k in C['categories']:
    if k['id']=='furniture':
        k['tabs']=[{'id':'seating','nameKo':'의자·소파'},{'id':'table','nameKo':'테이블·책상'},{'id':'bed','nameKo':'침대'},{'id':'storage','nameKo':'수납장·협탁'},{'id':'bookshelf','nameKo':'책장'},{'id':'fireplace','nameKo':'벽난로'}]
        if not any(s['id']=='shelf' for s in k['subcategories']):k['subcategories'].append({'id':'shelf','nameKo':'책장'})
    if k['id']=='kitchen':
        for s in [{'id':'small-appliance','nameKo':'조리 가전'},{'id':'shelf','nameKo':'주방 선반'}]:
            if not any(x['id']==s['id'] for x in k['subcategories']):k['subcategories'].append(s)
json.dump(C,open(P('catalog/category-config.json'),'w'),ensure_ascii=False,indent=1)
# 로그/원시 기록에서 삭제 항목 제거
for f in ['logs/extract-raw.json','logs/build-stats.json','catalog/fill_rules.json']:
    p=P(f)
    if not os.path.exists(p):continue
    t=open(p).read()
    if 'ornament-capital' in t:log(f'참고: {f} 에 ornament-capital 문구가 남아 있음')
open(P('logs/r9-changes.md'),'w').write('\n'.join(LOG)+'\n')
print('\n'.join(LOG[-40:]))
