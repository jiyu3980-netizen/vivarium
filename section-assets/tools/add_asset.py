#!/usr/bin/env python3
"""새 가구 1개 등록(전체 재변환 없음). 기존 에셋·카탈로그는 건드리지 않고 항목만 추가한다.
 1) assets/svg/<id>/ 에 front.svg, rightSide.svg, leftSide.svg 중 있는 것을 넣는다(파일명 소문자, SVG 는 viewBox 필요).
 2) python3 add_asset.py <id> "<한글이름>" <categoryId> [--width-cm 120 --height-cm 80 --depth-cm 50]
 3) 면 채움(fill.svg)과 썸네일(png)은 이 에셋 것만 만들고, 마지막에 validate_assets.py 로 검사한다."""
import json,os,re,sys,argparse,subprocess
H=os.path.dirname(os.path.abspath(__file__));R=os.path.dirname(H)+'/'
ap=argparse.ArgumentParser();ap.add_argument('id');ap.add_argument('name');ap.add_argument('cat')
ap.add_argument('--width-cm',type=float,required=True);ap.add_argument('--height-cm',type=float,required=True);ap.add_argument('--depth-cm',type=float,default=None)
g=ap.parse_args();i=g.id
if not re.fullmatch(r'[a-z0-9][a-z0-9\-_.]*',i):sys.exit('ID 는 소문자·숫자·-_. 만 사용')
J=json.load(open(R+'catalog/assets.json',encoding='utf-8'))
if any(a['assetId']==i for a in J['assets']):sys.exit('이미 있는 ID: '+i)
if g.cat not in {c['id'] for c in json.load(open(R+'catalog/category-config.json',encoding='utf-8'))['categories']}:sys.exit('없는 categoryId')
d=R+'assets/svg/'+i
views={'front':None,'leftSide':None,'rightSide':None}
for k in views:
    p=f'{d}/{k}.svg'
    if os.path.isfile(p):
        vb=re.search(r'viewBox="([^"]*)"',open(p).read(1200));
        if not vb:sys.exit(k+'.svg 에 viewBox 없음')
        x=[float(t) for t in vb[1].split()];asp=round(x[2]/x[3],4)
        wu=g.width_cm if k=='front' else (g.depth_cm or g.width_cm)
        views[k]={'svg':f'assets/svg/{i}/{k}.svg','viewBox':vb[1],'aspect':asp,'widthUnits':wu,'heightUnits':round(wu/asp,3),'segments':0,'anchor':{'x':0.5,'y':1.0,'note':'바닥 접지점=하단 중앙'},'flags':[],'excludedEntities':{}}
if not any(views.values()):sys.exit('front/leftSide/rightSide.svg 중 하나는 필요: '+d)
J['assets'].append({'assetId':i,'nameKo':g.name,'nameEn':i,'categoryId':g.cat,'subcategoryId':g.cat,'tags':[g.name],'source':{'file':'manual'},'classification':{'basis':'manual','confidence':'high'},'views':views,'extraViews':{},'reviewReasons':[],'errors':[],'sizeSource':'manual','unit':{'name':'cm','toCm':1},'defaultSizeCm':{'width':g.width_cm,'height':g.height_cm,'depth':g.depth_cm},'placement':{'origin':'bottom-center'},'viewBox':(views['front'] or next(v for v in views.values() if v))['viewBox'],'status':'ok'})
json.dump(J,open(R+'catalog/assets.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
subprocess.check_call([sys.executable,H+'/refill.py',i]);subprocess.check_call([sys.executable,H+'/make_thumbs.py',i])
subprocess.check_call([sys.executable,H+'/make_web_catalog.py'])
subprocess.call([sys.executable,H+'/validate_assets.py'])
