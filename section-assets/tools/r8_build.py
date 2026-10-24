#!/usr/bin/env python3
"""8차: 신규 DWG(추가 가구 43개) → 개별 에셋 등록. 스테이징(/mnt/user-data/work/new8/stage)에서 추출·분류된 뷰를 골라
   assets/svg/<id>/ 로 복사하고 catalog 에 항목만 추가한다(기존 에셋은 건드리지 않음). 선 데이터는 변형하지 않는다(분리·좌우 반전만).
usage: python3 r8_build.py"""
import json,os,sys,shutil,copy,re
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(HERE);sys.path.insert(0,HERE)
import svgtools as T
ST='/mnt/user-data/work/new8/stage/'
SJ={a['assetId']:a for a in json.load(open(ST+'catalog/assets.json'))['assets']}
CAT=ROOT+'/catalog/assets.json';J=json.load(open(CAT));A=J['assets'];IDS={a['assetId'] for a in A}
SV='assets/svg/'
NEW=[];LOG=[]
def view(src,u):
    a=SJ[src];return (a.get('extraViews') or {}).get(u) or a['views'].get(u)
def nseg(subs):return sum(max(1,len(s)-1) for s in subs)
def ent(rel,vb,wu,hu,seg,kind,block):
    return dict(svg=rel,viewBox=vb,aspect=round(wu/hu,4),widthUnits=round(wu,3),heightUnits=round(hu,3),segments=seg,
        anchor=dict(x=0.5,y=0.5,note='평면 중심') if kind=='top' else dict(x=0.5,y=1.0,note='바닥 접지점=하단 중앙'),flags=[],sourceBlock=block,excludedEntities={})
def put(aid,k,src,u,s,subs=None):
    """뷰 하나를 assets/svg/<aid>/<k>.svg 로 만든다. subs 가 있으면 그 선들만(분리) 사용."""
    v=view(src,u);rel=f'{SV}{aid}/{k}.svg';os.makedirs(ROOT+'/'+os.path.dirname(rel),exist_ok=True)
    W0,H0=[float(x) for x in v['viewBox'].split()[2:]];upn=max(v['widthUnits'],v['heightUnits'])/max(W0,H0)
    if subs is None:
        shutil.copy(ST+v['svg'],ROOT+'/'+rel);return ent(rel,v['viewBox'],v['widthUnits']*s,v['heightUnits']*s,v['segments'],'top' if k=='top' else 'x',f"{src}/{u}")
    vbs,kk,(x0,y0,w,h),_=T.write_svg(ROOT+'/'+rel,subs,norm=True)
    return ent(rel,vbs,w*upn*s,h*upn*s,nseg(subs),'top' if k=='top' else 'x',f"{src}/{u} (분리)")
def add(aid,name,cat,sub,src,front=None,side=None,top=None,sc=None,h=None,w=None,subs=None,note=None,side_src=None):
    if aid in IDS:LOG.append('건너뜀(이미 있음): '+aid);return
    main=view(src,front or side);
    s=sc or (h/main['heightUnits'] if h else w/main['widthUnits'])
    a=copy.deepcopy(SJ[src]);a.update(assetId=aid,nameKo=name,nameEn=aid,categoryId=cat,subcategoryId=sub,tags=[name],views={'front':None,'leftSide':None,'rightSide':None},extraViews={})
    a['source']['batch']='8차 추가 가구 dwg';a['classification']=dict(basis='8차 수동 분류(이미지 확인)',confidence='high')
    if front:a['views']['front']=put(aid,'front',src,front,s,(subs or {}).get('front'))
    if side:a['views']['rightSide']=put(aid,'rightSide',side_src or src,side,s,(subs or {}).get('side'))
    if top:a['extraViews']['top']=put(aid,'top',src,top,s)
    fv=a['views']['front'];sv=a['views']['rightSide'];ref=fv or sv
    d=sv['widthUnits'] if sv and fv else (a['extraViews']['top']['heightUnits'] if top else None)
    if d and d>3*max(ref['widthUnits'],ref['heightUnits']):d=None
    a['defaultSizeCm']=dict(width=round((fv or sv)['widthUnits'],1),height=round(ref['heightUnits'],1),depth=round(d,1) if d else None)
    a['unit']=dict(insunits=a['source'].get('insunits'),name='cm(추정)',toCm=round(s,5));a['sizeSource']='user-real-world-estimate'
    a['viewBox']=ref['viewBox'];a['reviewReasons']=([note] if note else [])+(['front-only'] if fv and not sv else []);a['errors']=[];a['status']='ok-with-notes' if a['reviewReasons'] else 'ok'
    NEW.append(a);IDS.add(aid)
def mirror_sides(a):
    l,r=a['views']['leftSide'],a['views']['rightSide']
    if bool(l)==bool(r):return
    sk,dk=('leftSide','rightSide') if l else ('rightSide','leftSide');e=a['views'][sk]
    vb,subs=T.load(ROOT+'/'+e['svg']);W,H=[float(x) for x in e['viewBox'].split()[2:]]
    rel=f"{SV}{a['assetId']}/{dk}.svg";T.write_svg(ROOT+'/'+rel,T.mirror_x(subs,W),bbox=(0,0,W,H),norm=False)
    d=dict(e);d['svg']=rel;d.pop('fill',None);d['derived']=dict(mirroredFrom=sk);d['sourceBlock']=e['sourceBlock']+' (좌우 반전)';a['views'][dk]=d
    a['reviewReasons'].append(f'{dk}-derived-by-mirror')

D='architectural-elements'
# ---- 문 (문·창호 카테고리)
add('classic-wooden-carved-panel-door','클래식 조각 목문',D,'door','classic-wooden-carved-panel-door',front='unknown-2',side='unknown-3',top='unknown-1',sc=0.1)
add('classic-teal-double-french-glass-door','클래식 프렌치 유리 양문',D,'door','classic-teal-double-french-glass-door',front='unknown-3',side='unknown-2',top='unknown-1',sc=0.1)
add('modern-interior-door','모던 실내문',D,'door','modern-interior-door',front='unknown-3',sc=0.1)
add('modern-glass-door','모던 유리문',D,'door','modern-glass-door',front='unknown-1',sc=0.1)
add('single-door','외여닫이 문 (유리창)',D,'door','single-door',front='unknown-3',side='unknown-2',top='unknown-1',sc=0.1)
add('standard-interior-door-with-handle','실내문 (손잡이)',D,'door','standard-interior-door-with-handle',front='unknown-3',sc=0.1)
add('free-aesthetic-double-swing-door','장식 양개 스윙 도어',D,'door','free-aesthetic-double-swing-door-plan-elevation-001',front='unknown-1',top='unknown-2',sc=0.1)
add('window-shutter','창 셔터 (루버)',D,'window','free-single-window-shutter',front='unknown-3',sc=100)
# ---- 창호
add('arched-double-french-window','아치형 프렌치 양창',D,'window','arched-double-french-window2',front='unknown-1',sc=0.1)
add('arched-double-window','아치형 양창',D,'window','arched-double-window',front='unknown-1',sc=0.1)
add('double-hung-window-4pane','더블 행 창 (4분할)',D,'window','double-hung-window-4-pane',front='unknown-2',h=190)
add('double-hung-window-4pane-pair','더블 행 창 (4분할 2연)',D,'window','double-hung-window-4-pane',front='unknown-3',sc=0.1)
add('double-hung-window','더블 행 창 (단순)',D,'window','double-hung-window',front='unknown-1',sc=0.1)
add('three-section-sliding-window-tall','3단 미닫이 창 (세로형)',D,'window','three-section-sliding-window',front='unknown-2',h=190)
add('three-section-sliding-window-wide','3단 미닫이 창 (가로형)',D,'window','three-section-sliding-window',front='unknown-3',sc=0.1)
add('vertical-window','세로 창',D,'window','vertical-window',front='unknown-2',sc=0.1)
add('victorian-window-1','빅토리안 창 1',D,'window','victorian-windows-2-20260223',front='unknown-2',top='unknown-1',sc=0.1)
add('victorian-window-2','빅토리안 창 2',D,'window','victorian-windows-2-20260223',front='unknown-5',top='unknown-3',sc=0.1)
add('victorian-window-3','빅토리안 창 3',D,'window','victorian-windows-2-20260223',front='unknown-6',top='unknown-4',sc=0.1)
add('arched-large-window','아치형 대형 창',D,'window','arched-large-storage-cabinets',front='unknown-1',h=300,note='원본 파일명은 storage-cabinets 이지만 아치형 창 모양이어서 창으로 분류')
# ---- 지붕·난간 (문·창호 카테고리 > 건축 부재)
add('hip-roof','우진각 지붕',D,'built-in-structure','hip-roof',front='unknown-1',sc=0.1)
add('islamic-geometric-railing','기하 문양 난간',D,'built-in-structure','islamic-geometric-straight-railing',front='unknown-1',sc=0.1)
# ---- 욕실
add('bath-roll-top','롤탑 욕조','bathroom','bathtub','bath-roll-top',front='unknown-2',side='unknown-3',top='unknown-1',sc=0.1)
add('bathtub-built-in','욕조 (일반형)','bathroom','bathtub','bath',front='unknown-3',side='unknown-2',top='unknown-1',sc=0.1)
add('shower-enclosure-head','샤워부스 + 샤워헤드','bathroom','shower-enclosure','shower-enclosure-and-shower-head',front='unknown-2',side='unknown-3',top='unknown-1',sc=0.1)
add('old-bathroom-sink-1','구형 세면대 1','bathroom','bathroom-sink','old-bathroom-sink',front='unknown-4',side='unknown-1',side_src='old-bathroom-sink-side',sc=0.1)
add('old-bathroom-sink-2','구형 세면대 2','bathroom','bathroom-sink','old-bathroom-sink2',front='unknown-1',side='unknown-1',side_src='old-bathroom-sink-side',sc=0.1)
# ---- 가구·가전·조명·식물·소품
add('bedroom-wall-lamp','침실 벽등','lighting','wall-light','bedroom-wall-lamp',front='unknown-1',side='unknown-2',top='unknown-3',sc=100)
add('filing-cabinet-type-1','서류 캐비닛 (3단)','furniture','cabinet','filling-cabinet-type-1',front='unknown-1',side='unknown-2',sc=0.1,note='측면 도면은 서랍이 열린 상태')
add('kitchen-sink-cabinet','싱크대 캐비닛','kitchen','kitchen-sink','kitchensink-cabinet',front='unknown-1',sc=0.1)
add('ikea-microwave-lagan','IKEA 전자레인지 (LAGAN)','appliances','small-appliance','ikea-microwave-lagan',front='unknown-2',side='unknown-4',top='unknown-3',sc=0.1)
add('hamburger','햄버거','food-drink','food','hamburger',front='unknown-1',h=12)
add('tree-elev-2','수목 군락 (입면)','plants','outdoor-garden','tree-elev-2',front='unknown-1',sc=0.1)
add('whiskey-cabinet-front','양문 캐비닛 (whiskey 파일)','furniture','cabinet','whiskey',front='unknown-2',sc=0.1,note='파일명 whiskey — 정확한 용도 미확인, 2문 정면으로 등록')
add('classic-table-lamp','클래식 전기스탠드','lighting','table-lamp','classic-sofa-and-armchairs-living-room-elevation',front='unknown-2',h=55)
# ---- 장식 소품: CB59 촛대 / CB62 병 / CB63 와인랙 / CB64 책 / 꽃병 / 기둥 장식 / 액자
for n in range(1,7):add(f'candle-holder-{n}',f'촛대 {n}','decor','ornament','cb59-table-candles-el',front=f'unknown-{n}',sc=0.1)
for n in (1,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20,23,24,25,26):add(f'bottle-{n}',f'병 {n}','food-drink','food','cb62-wine-bottles-el',front=f'unknown-{n}',sc=0.1)
add('wine-rack-zigzag','와인 랙 (지그재그)','storage-lifestyle','shelf','cb63-wine-rack-el',front='unknown-1',sc=0.1)
for n in (2,3,4,5):add(f'wine-bottle-cart-{n-1}',f'와인병 대포 장식 {n-1}','decor','ornament','cb63-wine-rack-el',front=f'unknown-{n}',sc=0.1)
for n in (1,2,3,4,6,7,8,9,10,11,12,13,14,15):add(f'book-set-{n}',f'책 묶음 {n}','decor','ornament','cb64-books-el',front=f'unknown-{n}',sc=0.1)
for n in (1,3,4,5,6,7,8,10,12,13,14,15,16,17,18):add(f'flower-vase-{n}',f'꽃병 {n}','decor','ornament','flower-vase',front=f'unknown-{n}',sc=0.1)
add('flower-vase-19','꽃병 19','decor','ornament','flower-vase',front='front',sc=0.1)
for n in range(1,33):
    col=n in (1,4,6)
    add(f'ornament-{"column" if col else "capital"}-{n}',f'{"기둥" if col else "기둥머리 장식"} {n}','decor','ornament','ornaments-set',front=f'unknown-{n}',sc=1.0)
add('picture-frame','액자 (벽걸이)','decor','ornament','picture-frame',front='unknown-2',sc=0.1)
add('griffin-ornament','그리핀 장식','decor','ornament','picture-frame',front='unknown-1',sc=0.1)
add('sports-car','스포츠카 (오픈카)','vehicle','vehicle','picture-frame',side='unknown-4',w=430)
# ---- 클래식 소파 세트(안락의자 2 + 소파 1 한 장) → 개별 분리
_SRC='classic-sofa-and-armchairs-living-room-elevation'
_v=view(_SRC,'unknown-1');_vb,_subs=T.load(ST+_v['svg'])
_cl=sorted(((T.cl_bbox(_subs,c),c) for c in T.clusters(_subs,3.0)),key=lambda t:t[0][0]);_cl=[t for t in _cl if t[0][2]-t[0][0]>30]
assert len(_cl)==3,len(_cl)
add('classic-armchair','클래식 안락의자','furniture','chair',_SRC,front='unknown-1',sc=0.1,subs={'front':[_subs[j] for j in _cl[0][1]]})
add('classic-sofa-3seat','클래식 3인 소파','furniture','sofa',_SRC,front='unknown-1',sc=0.1,subs={'front':[_subs[j] for j in _cl[1][1]]})
if '--commit' in sys.argv:
    for a in NEW:mirror_sides(a)
    A.extend(NEW);json.dump(J,open(CAT,'w'),ensure_ascii=False,indent=1)
print(len(NEW),'새 에셋 (sofa 분리 제외)');print('\n'.join(LOG))
