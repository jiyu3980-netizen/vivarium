#!/usr/bin/env python3
"""extract-raw.json + rules.py → catalog/assets.json, category-config.json, logs, (미리보기는 make_preview.py)
원본 DWG/ADJ 사전만 사용, 가구 SVG는 assets/svg 에 별도 파일로 유지."""
import json,re,os,sys,collections,shutil
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(HERE)
sys.path.insert(0,HERE);from rules import R,ADJ
from common import UNIT_CM,UNIT_NAME,RANGE
raw=json.load(open(ROOT+'/logs/extract-raw.json'))
CATS=[('furniture','가구','Furniture',[('bed','침대'),('sofa','소파'),('desk','책상'),('chair','의자'),('cabinet','수납장'),('dining-table','식탁·테이블'),('side-table-bench','사이드 테이블·벤치'),('fireplace','벽난로·난로')]),
('lighting','조명','Lighting',[('ceiling-light','천장등'),('floor-lamp','스탠드'),('wall-light','벽등'),('table-lamp','테이블 램프')]),
('kitchen','주방','Kitchen',[('kitchen-sink','싱크대'),('refrigerator','냉장고'),('oven','레인지·오븐'),('countertop','조리대·주방 유닛'),('tableware','식기'),('cookware-food','조리도구')]),
('bathroom','욕실','Bathroom',[('bathroom-sink','세면대'),('toilet','변기'),('bathtub','욕조'),('shower-enclosure','샤워부스'),('towel-holder','수건·휴지걸이'),('bathroom-accessory','욕실 소품')]),
('appliances','가전','Appliances',[('television','TV'),('washing-machine','세탁기'),('air-conditioner','에어컨·선풍기'),('heater','보일러·히터'),('small-appliance','소형 가전')]),
('storage-lifestyle','수납·생활용품','Storage & Lifestyle',[('shelf','선반·책장'),('clothes-hanger','옷걸이'),('mirror','거울'),('waste-bin','바구니·쓰레기통')]),
('decor','인테리어 소품','Decor',[('ornament','장식품'),('clock','시계')]),
('architectural-elements','문·창호·건축 요소','Architectural Elements',[('door','문'),('window','창문'),('staircase','계단'),('partition','파티션'),('built-in-structure','건축 부재')]),
('plants','식물·정원','Plants & Garden',[('indoor-plant','식물'),('planter','화분·플랜터'),('outdoor-garden','정원·야외 시설')]),
('electronics','전자·IT','Electronics',[('gaming-av','AV·게임기기'),('it-network','IT·설비'),('camera','카메라')]),
('hobby','취미·문화','Hobby & Culture',[('music-instrument','악기'),('art-craft','미술·실험 용품'),('game-table','게임')]),
('food-drink','음식·음료','Food & Drink',[('food','음식·음료')]),
('animals','동물·인형','Animals & Toys',[('pet-animal','동물·인형')]),
('clothing','의류·잡화','Clothing',[('clothes','의류·잡화')]),
('vehicle','차량','Vehicles',[('vehicle','차량')]),
('other','기타','Other',[('miscellaneous-household-items','기타 생활용품'),('telephone-audio','전화기·음향기기')]),
('unclassified','미분류(검토 필요)','Unclassified',[('needs-review','검토 필요')])]
SUBTAG={'bed':['침실'],'desk':['서재','사무실'],'sofa':['거실'],'dining-table':['거실','식당'],'kitchen-sink':['주방'],'bathroom-sink':['욕실'],'toilet':['욕실'],'bathtub':['욕실'],'shower-enclosure':['욕실'],'towel-holder':['욕실'],'bathroom-accessory':['욕실'],
'refrigerator':['주방'],'oven':['주방'],'countertop':['주방'],'cookware-food':['주방'],'tableware':['주방','식당'],'washing-machine':['세탁실'],'television':['거실'],'indoor-plant':['실내','정원'],'outdoor-garden':['야외'],'planter':['실내','야외'],'vehicle':['야외'],'door':['출입구'],'window':['외벽']}
def norm(n):
    n=re.sub(r'\s*\(\d+\)$','',n);n=re.sub(r'[_\-\+]+',' ',n).strip().lower();return re.sub(r'\s+',' ',n)
def tr(tokens):
    s=' '.join(tokens).strip()
    if not s:return ''
    out=[];keys=sorted(ADJ,key=lambda k:-len(k));i=s
    # 좌→우 최장 일치 번역
    res=[];rest=s
    while rest:
        for k in keys:
            if rest==k or rest.startswith(k+' '):
                res.append(ADJ[k]);rest=rest[len(k):].lstrip();break
        else:
            w,_,rest=rest.partition(' ');res.append(w.capitalize() if w.isalpha() else w)
    return ' '.join(res)
def classify(fn):
    base=norm(re.sub(r'\.dwg$','',fn,flags=re.I));hits=[]
    for rx,ko,cat,sub,tags,conf in R:
        m=re.search(rx,base)
        if m:hits.append((m,ko,cat,sub,tags,conf));break
    if not hits:return dict(ko=tr(base.split()) or base,cat='unclassified',sub='needs-review',tags=base.split(),conf='none',basis='파일명에서 일치하는 가구 종류 키워드를 찾지 못함')
    m,ko,cat,sub,tags,conf=hits[0]
    pre=base[:m.start()].split();suf=base[m.end():].split()
    name=ko[:-1] if ko.endswith('!') else ' '.join(x for x in [' '.join(w for w in tr(pre).split() if w not in ko),ko,' '.join(w for w in tr(suf).split() if w not in ko)] if x)
    name=re.sub(r'\s+\+\s*$','',name).replace(' + ',' + ')
    return dict(ko=name,cat=cat,sub=sub,tags=list(dict.fromkeys(tags+SUBTAG.get(sub,[])+base.split())),conf=conf,basis=f"파일명 '{base}' 에서 키워드 '{m.group(0)}' 일치")
USED={}
PICK={'range-with-hood':{'front':'SBU009E','rightSide':'SBU001S'},'commercial-dishwasher-with-tables':{'front':'CIK050E','top':'CIK050P'}}  # 후드 정면(ME00328E)이 아니라 레인지 본체 뷰를 사용
VK=['front','leftSide','rightSide','top','back','section']
assets=[];viewlog=[];stats=collections.Counter()
for r in raw:
    fn=r['file'];slug=re.sub(r'[^a-z0-9]+','-',fn[:-4].lower()).strip('-')
    c=classify(fn)
    _n=USED.get(slug,0);USED[slug]=_n+1
    if _n:slug=f'{slug}-{_n+1}'
    if r['status']!='ok':
        stats['file_error']+=1;assets.append(dict(assetId=slug,nameKo=c['ko'],categoryId=c['cat'],subcategoryId=c['sub'],tags=c['tags'],source=dict(file=fn,path='dwg-extract/'+fn),views={},status='failed',errors=r['errors'],reviewReasons=['extraction-error']));continue
    views=[v for v in r['views'] if v.get('svg')]
    empty=[v for v in r['views'] if not v.get('svg')]
    kc=collections.Counter(v['kind'] for v in views if v['kind']!='unknown')
    vars_=sorted({v['variant'] for v in views if v['kind']!='unknown'})
    multi=len(vars_)>1 and any(n>1 for n in kc.values())
    vidx={k:i+1 for i,k in enumerate(vars_)}
    groups=collections.defaultdict(list)
    for v in views:
        key=str(vidx[v['variant']]) if (multi and v['kind']!='unknown') else ''
        groups[key if v['kind']!='unknown' else '__unk'].append(v)
    unk=groups.pop('__unk',[])
    if not groups:groups['']=[]
    f=UNIT_CM.get(r['insunits'])
    for key,vs in sorted(groups.items()):
        aid=slug+('-v'+key if (multi and key) else '')
        a=dict(assetId=aid,nameKo=c['ko']+(f' ({key})' if multi and key else ''),nameEn=norm(fn[:-4]).title(),categoryId=c['cat'],subcategoryId=c['sub'],tags=c['tags'],
          source=dict(file=fn,path='dwg-extract/#Uac00#Uad6c dwg/'+fn,dwgVersion=r.get('dwgVersion'),insunits=r['insunits'],labels=r['labels'][:6]),
          classification=dict(basis=c['basis'],confidence=c['conf']),views={k:None for k in ['front','leftSide','rightSide']},extraViews={},reviewReasons=[],errors=[])
        by={}
        for v in vs:by[v['kind']]=v   # 같은 종류가 여러 개면 마지막(=기존 파일 덮어쓰기 결과와 동일)
        for k_,blk_ in PICK.get(slug,{}).items():   # 수동 지정(예: 레인지 본체 정면/측면)
            for v in vs:
                if v['kind']==k_ and v['block']==blk_:by[k_]=v
        def ent(v):return dict(svg='assets/svg/'+v['svg'].replace(os.sep,'/'),viewBox=v['viewBox'],aspect=round(v['widthUnits']/v['heightUnits'],4) if v['heightUnits'] else None,widthUnits=round(v['widthUnits'],3),heightUnits=round(v['heightUnits'],3),segments=v['segCount'],anchor=dict(x=0.5,y=1.0,note='바닥 접지점=하단 중앙'),flags=v['flags'],sourceBlock=v['block'],excludedEntities=v['excluded'])
        for k in ['front','leftSide','rightSide']:
            if k in by:a['views'][k]=ent(by[k])
        for k in ['top','back','section']:
            if k in by:e=ent(by[k]);e['anchor']=dict(x=0.5,y=0.5,note='평면 중심') if k=='top' else e['anchor'];a['extraViews'][k]=e
        if not multi and unk:
            for i,v in enumerate(unk):a['extraViews']['unknown-%d'%(i+1)]=ent(v)
        # 크기
        fv=by.get('front');sv=by.get('rightSide') or by.get('leftSide');tv=by.get('top')
        ref=fv or sv or tv
        if ref:
            if f is None:
                guess='mm' if max(ref['widthUnits'],ref['heightUnits'])>400 else 'cm';f2=0.1 if guess=='mm' else 1;a['reviewReasons'].append('units-unspecified-assumed-'+guess);uf=f2
            else:uf=f
            lo,hi=RANGE.get(c['sub'],(3,300));hraw=(fv or sv or ref)['heightUnits'];ctr=(lo*hi)**.5;a['sizeSource']='declared-unit' if f is not None else 'assumed-unit'
            if not(lo<=hraw*uf<=hi):
                fits=[x for x in (0.1,1,2.54,100,30.48) if lo<=hraw*x<=hi]
                if fits:uf=min(fits,key=lambda x:abs(__import__('math').log(hraw*x/ctr)));a['sizeSource']='unit-corrected-by-class-range';a['reviewReasons'].append('size-unit-corrected-by-class-range')
                else:uf=ctr/hraw if hraw>0 else uf;a['sizeSource']='class-estimated';a['reviewReasons'].append('size-estimated-from-class-range')
            a['unit']=dict(insunits=r['insunits'],name=UNIT_NAME.get(r['insunits'],str(r['insunits'])),toCm=uf)
            w=(fv or tv or sv)['widthUnits']*uf;h=(fv or sv)['heightUnits']*uf if (fv or sv) else None
            d=(sv['widthUnits']*uf) if sv else (tv['heightUnits']*uf if tv else None)
            a['defaultSizeCm']=dict(width=round(w,1),height=round(h,1) if h else None,depth=round(d,1) if d else None)
            
            if fv and tv and tv['widthUnits']>0 and not(0.8<=fv['widthUnits']/tv['widthUnits']<=1.25):a['reviewReasons'].append('width-mismatch-front-vs-top')
            if fv and sv and fv['heightUnits']>0 and not(0.75<=sv['heightUnits']/fv['heightUnits']<=1.33):a['reviewReasons'].append('height-mismatch-front-vs-side')
        a['placement']=dict(origin='bottom-center',note='정면/측면 SVG의 하단 중앙이 바닥 접지점')
        a['viewBox']=(a['views']['front'] or a['views']['rightSide'] or a['views']['leftSide'] or next(iter(a['extraViews'].values()),{})).get('viewBox') if (a['views']['front'] or a['views']['rightSide'] or a['views']['leftSide'] or a['extraViews']) else None
        if a['views']['front'] is None:a['reviewReasons'].append('missing-front')
        if a['views']['leftSide'] is None and a['views']['rightSide'] is None:a['reviewReasons'].append('missing-side')
        elif a['views']['leftSide'] is None:a['reviewReasons'].append('missing-leftSide')
        for k,v in list(a['views'].items())+list(a['extraViews'].items()):
            if v:
                for fl in v['flags']:a['reviewReasons'].append(f'{k}:{fl}')
        if multi:a['reviewReasons'].append('multi-variant-in-file')
        if unk and not multi:a['reviewReasons'].append('unclassified-geometry-present')
        if r.get('groundLines')==0 and False:pass
        if c['conf'] in('none','low'):a['reviewReasons'].append('classification-uncertain')
        elif c['conf']=='medium':a['reviewReasons'].append('classification-medium')
        if empty:a['reviewReasons'].append('empty-view-blocks:%d'%len(empty))
        a['reviewReasons']=list(dict.fromkeys(a['reviewReasons']))
        hasview=any(a['views'].values()) or a['extraViews']
        hard=[x for x in a['reviewReasons'] if not x.startswith(('missing-leftSide','classification-medium','missing-side','units-unspecified','size-unit-corrected'))]
        a['status']='failed' if not hasview else ('review' if hard or 'missing-side' in a['reviewReasons'] and False else 'ok')
        if a['status']=='ok' and any(x.startswith(('missing-side','units-unspecified')) for x in a['reviewReasons']):a['status']='ok-with-notes'
        stats['asset_'+a['status']]+=1;assets.append(a)
os.makedirs(ROOT+'/catalog',exist_ok=True)
json.dump(dict(version=1,generated=__import__('datetime').date.today().isoformat(),note='SVG는 assets/svg/ 에 별도 파일. 이 파일에는 메타데이터만 있음. 뷰 SVG는 필요할 때 개별 로드.',count=len(assets),assets=assets),open(ROOT+'/catalog/assets.json','w'),ensure_ascii=False,indent=1)
json.dump(dict(version=1,categories=[dict(id=i,nameKo=k,nameEn=e,subcategories=[dict(id=s,nameKo=n) for s,n in subs]) for i,k,e,subs in CATS]),open(ROOT+'/catalog/category-config.json','w'),ensure_ascii=False,indent=1)
cnt=collections.Counter(a['categoryId'] for a in assets)
json.dump(dict(stats=stats,byCategory=cnt,files=len(raw)),open(ROOT+'/logs/build-stats.json','w'),ensure_ascii=False,indent=1,default=dict)
print(dict(stats),dict(cnt),len(assets))
