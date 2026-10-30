#!/usr/bin/env python3
"""7차: 신규 에셋 이름/분류/크기 지정 (r7_apply.py 직후). 선 데이터는 건드리지 않음."""
import json,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J=json.load(open(ROOT+'/catalog/assets.json'));A={a['assetId']:a for a in J['assets']}
# id: (이름, 대분류, 소분류, 크기지정)  크기지정: None=계산값 유지, ('w',cm)=가로 기준 비례, ('h',cm)=높이 기준 비례
M={
'20ft-high-cube-container':('20피트 컨테이너','plants','outdoor-garden',('w',606)),
'apple':('사과','food-drink','food',None),
'battery-rack':('배터리 랙','storage-lifestyle','shelf',None),
'chevrolet-equinox-2':('쉐보레 이쿼녹스','vehicle','vehicle',None),
'diesel-generator':('디젤 발전기','other','miscellaneous-household-items',None),
'dish-and-cutlery-rack':('식기·커트러리 건조대','kitchen','tableware',None),
'hvac-unit':('에어컨 실외기','appliances','air-conditioner',None),
'mercedes-benz-g-63-amg':('메르세데스 벤츠 G63 AMG','vehicle','vehicle',None),
'milwaukee-packout':('공구함 (팩아웃)','other','miscellaneous-household-items',None),
'porsche-911':('포르쉐 911','vehicle','vehicle',('w',185)),
'potted-snake-plant':('스네이크 플랜트 화분','plants','indoor-plant',None),
'siberian-husky-dog':('시베리안 허스키','animals','pet-animal',None),
'smeg-coffee-machine-v1':('에스프레소 머신','appliances','small-appliance',None),
'smeg-coffee-machine-v2':('드립 커피메이커','appliances','small-appliance',None),
'subaru-outback':('스바루 아웃백','vehicle','vehicle',None),
'tissue-box':('휴지 상자','bathroom','bathroom-accessory',('w',24)),
'towel-holder':('타월 바','bathroom','towel-holder',None),
'toyota-tacoma':('토요타 타코마','vehicle','vehicle',None),
'veterinary-hospital-work-station':('동물병원 작업대','kitchen','countertop',('w',300)),
'wall-hanger':('벽 옷걸이 (4구)','storage-lifestyle','clothes-hanger',('w',80)),
'wall-mounted-toothbrush-holder':('칫솔 홀더','bathroom','bathroom-accessory',None),
'whiskey-glass':('위스키 잔','food-drink','food',None),
'writing-desk':('라이팅 데스크 + 의자','furniture','desk',None),
'air-fryer':('에어프라이어','appliances','small-appliance',None),
'barn-door':('헛간 슬라이딩 도어','architectural-elements','door',None),
'cadgrid-acacia-tree-elevation-in':('아카시아 나무','plants','outdoor-garden',('h',800)),
'cadgrid-layered-canopy-tree-elevation-in':('활엽수 (겹수관)','plants','outdoor-garden',('h',700)),
'cadgrid-classic-fireplace-with-mantel-elevation-in':('클래식 벽난로 (맨틀)','furniture','fireplace',('h',230)),
'cadgrid-stone-clad-double-sided-fireplace-elevation-in':('석재 양면 벽난로','furniture','fireplace',('h',250)),
'cadgrid-traditional-fireplace-with-chimney-breast-01-elevation-in':('전통 벽난로 (굴뚝 몸체)','furniture','fireplace',('h',260)),
'cocktail-table-and-chairs':('칵테일 테이블 + 스툴','furniture','dining-table',None),
'david-statue':('다비드 조각상','decor','ornament',None),
'hook-and-long-coat':('벽 고리 + 롱코트','storage-lifestyle','clothes-hanger',None),
'hookah':('물담배 (후카)','other','miscellaneous-household-items',None),
'rainwater-pipe':('빗물 배수관','architectural-elements','built-in-structure',('h',300)),
'strip-curtain':('스트립 커튼','decor','ornament',None),
'wire-shelving-unit':('와이어 선반장','storage-lifestyle','shelf',None),
'wood-cutting-machine':('목공 복합기','other','miscellaneous-household-items',None),
}
GRP={'5-bedside-tables':('침대 옆 탁자','furniture','side-table-bench'),'cake-stand':('케이크 스탠드','kitchen','tableware'),'coat-rack-stand':('코트 스탠드','storage-lifestyle','clothes-hanger'),
'kitchen-shelf':('주방 선반','storage-lifestyle','shelf'),'shoes-rack':('신발 랙','storage-lifestyle','shelf'),'pvc-pipes':('PVC 배관 부속','architectural-elements','built-in-structure')}
def setsize(a,spec):
    d=a['defaultSizeCm'];k=spec[1]/(d['width'] if spec[0]=='w' else d['height'])
    a['defaultSizeCm']={x:(round(v*k,1) if v else v) for x,v in d.items()};a['sizeSource']='user-real-world-estimate'
n=0
for aid,a in A.items():
    base=a['source'].get('splitFrom') or aid
    if aid in M:nm,c,s,sz=M[aid]
    elif base in GRP:
        nm,c,s=GRP[base];idx=a['source'].get('splitIndex');nm=f'{nm} {idx}';sz=None
    else:continue
    a['nameKo']=nm;a['categoryId']=c;a['subcategoryId']=s;a['tags']=list(dict.fromkeys([nm]+[t for t in a.get('tags',[]) if t.isascii() or t==nm]))
    a['classification']=dict(basis='7차 수동 분류(이미지 확인)',confidence='high')
    if aid=='shoes-rack-1':sz=('w',60)
    if aid=='shoes-rack-2':sz=('w',60)
    if aid=='shoes-rack-3':sz=('w',100)
    if sz and a.get('defaultSizeCm'):setsize(a,sz)
    if aid=='rainwater-pipe':a['defaultSizeCm']['depth']=None
    a['reviewReasons']=[r for r in a['reviewReasons'] if not r.startswith(('classification','size-'))];n+=1
J['assets']=list(A.values());json.dump(J,open(ROOT+'/catalog/assets.json','w'),ensure_ascii=False,indent=1)
print('meta applied',n)
for a in J['assets']:print(a['assetId'],a['nameKo'],a['categoryId'],a.get('defaultSizeCm'))
