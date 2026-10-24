#!/usr/bin/env python3
"""3차 수정 적용 (build_library.py 직후, make_fills.py 직전에 실행).
 - 파일 삭제 / 이름 변경 / 뷰 재지정 / 스위치 front↔top 교체
 - 선 정리(떨어진 선 제거) / 고양이 front 90° 회전
 - 뭉친 시트 분리(순서대로 -1,-2,-3…) / 한쪽만 있는 side 의 좌우 반전 생성
선 정보는 변형하지 않는다(이동·미러·회전·묶음 분리만). 원본 DWG 는 읽지 않는다.
usage: python3 r3_apply.py [--report]   (--report: 분리 대상의 클러스터 수만 출력)"""
import json,os,sys,re,shutil,copy,math,collections
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(HERE)
sys.path.insert(0,HERE)
import svgtools as T
from common import UNIT_CM,RANGE
CAT=ROOT+'/catalog/assets.json'
J=json.load(open(CAT));A=J['assets'];BY={a['assetId']:a for a in A}
LOG=[]
def log(s):LOG.append(s);print(s)
def P(rel):return ROOT+'/'+rel
SV='assets/svg/'
VK=('front','leftSide','rightSide')

# ---------------------------------------------------------------- 설정
DELETE=['hanging-clothes-v2','diya-oil-lamps-v2','classic-balusters']
RENAME={'boss-table':'서재 테이블','curtain-top-view':'샤워커튼'}
PROMOTE=[ # (assetId, 원래 키, 새 키)
 ('corner-l-shaped-computer-desk','unknown-1','front'),('corner-l-shaped-computer-desk','unknown-2','rightSide'),
 ('aquarium','unknown-1','front'),('aquarium','unknown-2','rightSide'),
 ('curtain-top-view','unknown-1','front')]
SWAP_FRONT_TOP=['network-switch']
CLEAN_STRAY={'range-with-hood':['front'],'rice-cooker':['front'],'juicer':['front']}  # 가장 큰 덩어리만 남김
ROTATE_CW90={'cat':['front']}
SIZE_UNIT={'range-with-hood':2.54,'vulcan-vc4gd':2.54}   # 카탈로그 블록(인치) — INSERT 스케일 0.0254 로 확인
# 분리 대상: gap(클러스터 병합 거리, 긴 변=1000 좌표), groups: {뷰: [[클러스터번호...],...]}, side_all/side_first: 개수가 다른 side 처리
SPLIT={
 'fireplaces':{}, 'rattan-chairs':{}, 'rattan-sofa':{'gaps':{'rightSide':30}},
 'entertainment-centers':{}, 'tv-stands':{'gap':14}, 'chandeliers':{}, 'industrial-chandeliers':{},
 'industrial-wall-sconce':{'side_all':['rightSide']}, 'bertazzoni-range':{}, 'hermetic-jars':{'extra':'unknown-%d'},
 'kitchen-decorations-condiments':{}, 'kitchen-pots':{}, 'outdoor-kitchens':{},
 '3-double-sinks-vanity':{'groups':{'front':[[1],[4],[2,3,5]],'rightSide':[[1,3],[4],[2,5]]}},
 'soapdish':{'extra':'unknown-%d'}, 'toilet-bidet':{'side_first':['rightSide']},
 'bookshelves':{}, 'floating-shelves':{}, 'domestic-wheelie-bin':{}, 'vintage-picture-frame':{},
 'decorative-candles-in-glass':{}, 'japanese-lanterns':{}, 'oil-lamps':{}, 'spanish-doors':{},
 'church-windows':{}, 'gothic-columns':{}, '3-modern-planter-box':{}, 'calathea-lutea-plants':{}, 'clay-pots':{},
 'vegetable-garden':{}, 'vegetables':{}, 'water-buckets':{}, 'radio':{}, 'intercom':{},
 'network-video-recorder':{}, 'quad-electrical-wall-outlet':{'side_all':['rightSide']},
}

# ---------------------------------------------------------------- 공통 함수
def vbwh(vb):
    p=[float(x) for x in vb.split()];return p[2],p[3]
def upn(v):
    W,H=vbwh(v['viewBox']);return max(v['widthUnits'],v['heightUnits'])/max(W,H)
def mk_entry(rel,vb,wu,hu,nseg,kind,block,flags=None,extra=None):
    e=dict(svg=rel,viewBox=vb,aspect=round(wu/hu,4) if hu else None,widthUnits=round(wu,3),heightUnits=round(hu,3),segments=nseg,
           anchor=dict(x=0.5,y=0.5,note='평면 중심') if kind=='top' else dict(x=0.5,y=1.0,note='바닥 접지점=하단 중앙'),
           flags=list(flags or []),sourceBlock=block,excludedEntities={})
    if extra:e.update(extra)
    return e
def nseg(subs):return sum(max(1,len(s)-1) for s in subs)
def ordered(subs,cl):
    bb=[(c,T.cl_bbox(subs,c)) for c in cl];bb.sort(key=lambda t:(t[1][1]+t[1][3])/2);rows=[]
    for c,b in bb:
        cy=(b[1]+b[3])/2;h=b[3]-b[1]
        for r in rows:
            if abs(r[0]-cy)<max(h,r[1])*0.5:r[2].append((c,b));break
        else:rows.append([cy,h,[(c,b)]])
    res=[]
    for r in rows:res+=[c for c,b in sorted(r[2],key=lambda t:t[1][0])]
    return res
def merge_contained(subs,cl,tol=2.0):
    items=[[list(c),T.cl_bbox(subs,c)] for c in cl];items.sort(key=lambda t:-(t[1][2]-t[1][0])*(t[1][3]-t[1][1]));out=[]
    for c,b in items:
        for o in out:
            ob=o[1]
            if b[0]>=ob[0]-tol and b[1]>=ob[1]-tol and b[2]<=ob[2]+tol and b[3]<=ob[3]+tol:o[0]+=c;break
        else:out.append([c,b])
    return [o[0] for o in out]
def view_items(v,gap,groups=None):
    vb,subs=T.load(P(v['svg']));cl=ordered(subs,merge_contained(subs,T.clusters(subs,gap)))
    if groups:
        cl=[sum((cl[n-1] for n in g),[]) for g in groups]
        cl=ordered(subs,cl)   # 묶은 뒤 읽기 순서 재정렬
    return vb,subs,cl
def write_view(dst_rel,subs,bbox=None,norm=True):
    os.makedirs(os.path.dirname(P(dst_rel)),exist_ok=True)
    return T.write_svg(P(dst_rel),subs,bbox=bbox,norm=norm)
def size_cm(a,uf=None):
    v=a['views'];fv,sv=v['front'],v['rightSide'] or v['leftSide'];tv=a['extraViews'].get('top')
    if uf is None:uf=a['unit']['toCm']
    ref=fv or sv or tv
    if not ref:return
    w=(fv or tv or sv)['widthUnits']*uf;h=(fv or sv)['heightUnits']*uf if (fv or sv) else None
    d=(sv['widthUnits']*uf) if sv else (tv['heightUnits']*uf if tv else None)
    if d and d>3*max(w,h or 0):d=None   # 평면도 비율이 비정상(예: 긴 띠)이면 깊이는 비워 둠
    a['defaultSizeCm']=dict(width=round(w,1),height=round(h,1) if h else None,depth=round(d,1) if d else None)
def resize_full(a,uf_override=None):
    """build_library 와 같은 규칙으로 단위·기본 크기를 다시 계산"""
    v=a['views'];fv,sv=v['front'],v['rightSide'] or v['leftSide'];tv=a['extraViews'].get('top');ref=fv or sv or tv
    if not ref:return
    ins=a['source'].get('insunits');f=UNIT_CM.get(ins)
    reasons=[x for x in a['reviewReasons'] if not x.startswith(('size-','units-unspecified'))]
    if uf_override:
        uf=uf_override;a['sizeSource']='declared-unit';a['reviewReasons']=reasons
        a['unit']=dict(insunits=ins,name=a.get('unit',{}).get('name','inch'),toCm=uf)
    else:
        if f is None:
            guess='mm' if max(ref['widthUnits'],ref['heightUnits'])>400 else 'cm';uf=0.1 if guess=='mm' else 1;reasons.append('units-unspecified-assumed-'+guess)
        else:uf=f
        lo,hi=RANGE.get(a['subcategoryId'],(3,300));hraw=(fv or sv or ref)['heightUnits'];ctr=(lo*hi)**.5;src='declared-unit' if f is not None else 'assumed-unit'
        if not(lo<=hraw*uf<=hi):
            fits=[x for x in (0.1,1,2.54,100,30.48) if lo<=hraw*x<=hi]
            if fits:uf=min(fits,key=lambda x:abs(math.log(hraw*x/ctr)));src='unit-corrected-by-class-range';reasons.append('size-unit-corrected-by-class-range')
            else:uf=ctr/hraw if hraw>0 else uf;src='class-estimated';reasons.append('size-estimated-from-class-range')
        a['sizeSource']=src;a['reviewReasons']=reasons
        a['unit']=dict(insunits=ins,name=(a.get('unit') or {}).get('name',str(ins)),toCm=uf)
    size_cm(a,uf)
def fix_reasons(a):
    r=[x for x in a['reviewReasons'] if not re.match(r'^(front|leftSide|rightSide|top|back|section|unknown-\d+):',x) and not x.startswith(('missing-front','missing-side','missing-leftSide','empty-view','unclassified-geometry'))]
    v=a['views']
    if not v['front']:r.append('missing-front')
    if not v['leftSide'] and not v['rightSide']:r.append('missing-side')
    elif not v['leftSide']:r.append('missing-leftSide')
    for g in ('views','extraViews'):
        for k,e in a[g].items():
            if e:
                for fl in e.get('flags',[]):r.append(f'{k}:{fl}')
    if any(k.startswith('unknown') for k in a['extraViews']) and not any(x=='multi-variant-in-file' for x in r):r.append('unclassified-geometry-present')
    a['reviewReasons']=list(dict.fromkeys(r))
def restatus(a):
    hard=[x for x in a['reviewReasons'] if not x.startswith(('missing-leftSide','classification-medium','missing-side','units-unspecified','size-unit-corrected','leftSide-derived','rightSide-derived','split-from'))]
    has=any(a['views'].values()) or a['extraViews']
    a['status']='failed' if not has else ('review' if hard else 'ok')
    if a['status']=='ok' and any(x.startswith(('missing-side','units-unspecified')) for x in a['reviewReasons']):a['status']='ok-with-notes'
    a['viewBox']=((a['views']['front'] or a['views']['rightSide'] or a['views']['leftSide'] or next(iter(a['extraViews'].values()),{})) or {}).get('viewBox')
def rm_dir(aid):
    d=P(SV+aid)
    if os.path.isdir(d):shutil.rmtree(d)

# ---------------------------------------------------------------- 1) 삭제 / 이름 변경
def do_delete():
    global A
    for i in DELETE:
        if i in BY:
            rm_dir(i);A=[a for a in A if a['assetId']!=i];log(f'삭제: {i} ({BY[i]["nameKo"]}) — 카탈로그 항목과 SVG 폴더 삭제(원본 DWG는 그대로)');del BY[i]
def do_rename():
    for i,n in RENAME.items():
        a=BY[i];old=a['nameKo'];a['nameKo']=n;a['tags']=list(dict.fromkeys([n]+[t for t in a['tags'] if t not in('사장','블라인드·커튼')]))
        a['classification']=dict(basis='사용자 지정 이름(3차 수정)',confidence='high');log(f'이름 변경: {i}: {old} → {n}')

# ---------------------------------------------------------------- 2) 뷰 재지정
def move_entry(a,src,dst):
    e=a['extraViews'].pop(src) if src in a['extraViews'] else a['views'][src]
    rel=SV+a['assetId']+'/'+dst+'.svg';os.makedirs(os.path.dirname(P(rel)),exist_ok=True)
    shutil.move(P(e['svg']),P(rel));e=dict(e);e['svg']=rel;e.pop('fill',None)
    e['anchor']=dict(x=0.5,y=1.0,note='바닥 접지점=하단 중앙');e['flags']=[x for x in e['flags'] if x!='extreme-aspect' or True]
    a['views'][dst]=e;return e
def do_promote():
    done=set()
    for aid,src,dst in PROMOTE:
        a=BY[aid];move_entry(a,src,dst);log(f'뷰 재지정: {aid}: {src} → {dst}')
        done.add(aid)
    for aid in done:
        a=BY[aid]
        if aid in RENAME or True:resize_full(a)
        fix_reasons(a);restatus(a)
def do_swap():
    for aid in SWAP_FRONT_TOP:
        a=BY[aid];f=a['views']['front'];t=a['extraViews']['top'];d=P(SV+aid)
        fp,tp=P(f['svg']),P(t['svg']);tmp=fp+'.tmp';os.replace(fp,tmp);os.replace(tp,fp);os.replace(tmp,tp)
        f2=dict(t);f2['svg']=f['svg'];f2['anchor']=dict(x=0.5,y=1.0,note='바닥 접지점=하단 중앙');f2.pop('fill',None)
        t2=dict(f);t2['svg']=t['svg'];t2['anchor']=dict(x=0.5,y=0.5,note='평면 중심');t2.pop('fill',None)
        a['views']['front']=f2;a['extraViews']['top']=t2
        log(f'뷰 교체: {aid}: top(원본 pl 블록)을 front 로, 기존 front 는 top 으로')
        resize_full(a);fix_reasons(a);restatus(a)

# ---------------------------------------------------------------- 3) 선 정리 / 회전
def clean_stray(aid,key,gap=3.0):
    a=BY[aid];e=a['views'][key];vb,subs=T.load(P(e['svg']));cl=T.clusters(subs,gap)
    bbs=[(T.cl_bbox(subs,c),c) for c in cl];main=max(bbs,key=lambda t:(t[0][2]-t[0][0])*(t[0][3]-t[0][1]))[1]
    keep=[subs[i] for i in main];removed=len(subs)-len(keep)
    if not removed:return
    u=upn(e);vbs,k,(x0,y0,w,h),(Wn,Hn)=write_view(e['svg'],keep)
    e.update(viewBox=vbs,widthUnits=round(w*u,3),heightUnits=round(h*u,3),aspect=round(w/h,4),segments=nseg(keep));e['flags']=[x for x in e['flags'] if x not in('stray-geometry-or-excess-margin','multi-item-in-view?')]
    e['cleaned']=f'떨어진 선 {len(cl)-1}묶음({removed}개 경로) 제거'
    log(f'선 정리: {aid}/{key}: 본체 외 떨어진 선 {len(cl)-1}묶음({removed}개 경로) 삭제')
    resize_full(a,SIZE_UNIT.get(aid)) if aid in SIZE_UNIT else size_cm(a);fix_reasons(a);restatus(a)
def rotate_cw(aid,key):
    a=BY[aid];e=a['views'][key];vb,subs=T.load(P(e['svg']));W,H=vbwh(e['viewBox'])
    rs=T.rotate_cw90(subs,H);vbs,k,_,_=write_view(e['svg'],rs,bbox=(0,0,H,W),norm=False)
    e.update(viewBox=vbs,widthUnits=e['heightUnits'],heightUnits=e['widthUnits'])
    e['aspect']=round(e['widthUnits']/e['heightUnits'],4);e['rotatedCW90']=True;e.pop('fill',None)
    log(f'회전: {aid}/{key}: 시계 방향(오른쪽) 90° 회전')
    size_cm(a);fix_reasons(a)

# ---------------------------------------------------------------- 4) 분리
def split_asset(aid,cfg,report=False):
    a=BY[aid];gap=cfg.get('gap',6.0);gaps=cfg.get('gaps',{});groups=cfg.get('groups',{})
    src={k:v for k,v in a['views'].items() if v}
    ex={k:v for k,v in a['extraViews'].items() if v and k in('top','back','section')}
    cl={k:view_items(v,gaps.get(k,gap),groups.get(k)) for k,v in list(src.items())+list(ex.items())}
    ref='front' if 'front' in src else (next(iter(src)) if src else None)
    N=len(cl[ref][2])
    if report:print(f'{aid:34s} N={N} '+' '.join(f'{k}:{len(c[2])}' for k,c in cl.items()));return
    if N<2:log(f'분리 생략: {aid} (덩어리 {N}개)');return
    uf=a['unit']['toCm'];kids=[]
    for i in range(N):
        cid=f'{aid}-{i+1}';k_=copy.deepcopy(a);k_['assetId']=cid;k_['nameKo']=f"{a['nameKo']} {i+1}";k_['nameEn']=f"{a.get('nameEn','')} {i+1}".strip()
        k_['source']['splitFrom']=aid;k_['source']['splitIndex']=i+1;k_['source']['splitCount']=N
        k_['views']={x:None for x in VK};k_['extraViews']={};notes=[]
        for k,(vb,subs,items) in cl.items():
            v=(src.get(k) or ex.get(k));n=len(items)
            if n==N:idx=items[i]
            elif k in cfg.get('side_all',[]) and n==1:idx=items[0]
            elif k in cfg.get('side_first',[]) and n==1 and i==0:idx=items[0]
            else:idx=None;
            if idx is None:
                if k in VK:notes.append(f'{k}-not-paired({n}!={N})')
                continue
            sub=[subs[j] for j in idx];rel=f'{SV}{cid}/{k}.svg';u=upn(v)
            vbs,kk,(x0,y0,w,h),_=write_view(rel,sub)
            e=mk_entry(rel,vbs,w*u,h*u,nseg(sub),'top' if k=='top' else 'x',f"{v['sourceBlock']} [{i+1}/{N}]")
            if k in VK:k_['views'][k]=e
            else:k_['extraViews'][k]=e
        if cfg.get('extra'):
            for kx,vx in a['extraViews'].items():
                m=re.fullmatch(cfg['extra'].replace('%d',r'(\d+)'),kx)
                if vx and m and int(m.group(1))==i+1:
                    rel=f'{SV}{cid}/top.svg';os.makedirs(os.path.dirname(P(rel)),exist_ok=True);shutil.copy(P(vx['svg']),P(rel))
                    e=dict(vx);e['svg']=rel;e['anchor']=dict(x=0.5,y=0.5,note='평면 중심');e['sourceBlock']+=f' ({kx}→top)';k_['extraViews']['top']=e
        k_['reviewReasons']=[x for x in a['reviewReasons'] if not re.search(r'multi-item|multi-variant|unclassified-geom|missing-|^(front|leftSide|rightSide|top|back|section|unknown-\d+):',x)]
        k_['reviewReasons'].append('split-from-multi-item-sheet');k_['reviewReasons']+=notes
        k_['errors']=[]
        size_cm(k_,uf);fix_reasons(k_);k_['reviewReasons'].append('split-from-multi-item-sheet') if 'split-from-multi-item-sheet' not in k_['reviewReasons'] else None
        restatus(k_);kids.append(k_)
    pos=A.index(a);A[pos:pos+1]=kids;del BY[aid]
    for k_ in kids:BY[k_['assetId']]=k_
    rm_dir(aid);log(f'분리: {aid} → {", ".join(k["assetId"] for k in kids)} ({N}개; '+', '.join(f'{k}:{len(c[2])}덩어리' for k,c in cl.items())+')')

# ---------------------------------------------------------------- 5) 좌우 반전
def mirror_missing_sides():
    n=0
    for a in A:
        l,r=a['views']['leftSide'],a['views']['rightSide']
        if bool(l)==bool(r):continue
        sk,dk=('leftSide','rightSide') if l else ('rightSide','leftSide');e=a['views'][sk]
        vb,subs=T.load(P(e['svg']));W,H=vbwh(e['viewBox'])
        rel=f"{SV}{a['assetId']}/{dk}.svg";write_view(rel,T.mirror_x(subs,W),bbox=(0,0,W,H),norm=False)
        d=dict(e);d['svg']=rel;d.pop('fill',None);d['derived']=dict(mirroredFrom=sk);d['sourceBlock']=f"{e['sourceBlock']} (좌우 반전)"
        a['views'][dk]=d;a['reviewReasons']=[x for x in a['reviewReasons'] if x not in('missing-leftSide','missing-side')]
        a['reviewReasons'].append(f'{dk}-derived-by-mirror');n+=1
    log(f'좌우 반전 생성: {n}개 에셋')

if __name__=='__main__':
    if '--report' in sys.argv:
        for aid,cfg in SPLIT.items():split_asset(aid,cfg,report=True)
        sys.exit()
    do_delete();do_rename();do_promote();do_swap()
    for aid,keys in CLEAN_STRAY.items():
        for k in keys:clean_stray(aid,k)
    for aid,uf in SIZE_UNIT.items():
        if aid in BY and aid not in CLEAN_STRAY:resize_full(BY[aid],uf);fix_reasons(BY[aid]);restatus(BY[aid]);log(f'크기 단위 지정: {aid} = 인치(×2.54) → 기본 크기 {BY[aid]["defaultSizeCm"]}')
    for aid,keys in ROTATE_CW90.items():
        for k in keys:rotate_cw(aid,k)
    for aid,cfg in SPLIT.items():split_asset(aid,cfg)
    mirror_missing_sides()
    for a in A:
        # 이름이 바뀐 에셋/삭제 후 정리 및 상태 재계산(변경분만)
        pass
    # 참조되지 않는 SVG(중복 뷰의 사용 안 한 쪽·이전 fill 파일) 정리 — make_fills.py 가 fill 을 다시 만든다
    ref=set()
    for a in A:
        for g in ('views','extraViews'):
            for e in a[g].values():
                if e:ref.add(e['svg']);e.pop('fill',None)
    rm=0
    for d,_,fs in os.walk(ROOT+'/assets/svg'):
        for f_ in fs:
            rel=os.path.relpath(os.path.join(d,f_),ROOT).replace(os.sep,'/')
            if rel not in ref:os.remove(os.path.join(d,f_));rm+=1
    for d,ds,fs in os.walk(ROOT+'/assets/svg',topdown=False):
        if not os.listdir(d):os.rmdir(d)
    log(f'정리: 참조되지 않는 SVG {rm}개 삭제(사용하지 않은 중복 뷰, 이전 채움 파일)')
    J['assets']=A;J['count']=len(A)
    json.dump(J,open(CAT,'w'),ensure_ascii=False,indent=1)
    os.makedirs(ROOT+'/logs',exist_ok=True)
    open(ROOT+'/logs/r3-changes.md','w').write('# 3차 수정 적용 로그\n\n'+'\n'.join('- '+l for l in LOG)+'\n')
    print('assets',len(A))
