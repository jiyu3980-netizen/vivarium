#!/usr/bin/env python3
import json,os,collections,hashlib,subprocess,datetime
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A=json.load(open(ROOT+'/catalog/assets.json'))['assets'];raw=json.load(open(ROOT+'/logs/extract-raw.json'))
st=collections.Counter(a['status'] for a in A);cat=collections.Counter(a['categoryId'] for a in A)
rs=collections.Counter(r.split(':')[-1] if ':' in r else r for a in A for r in a['reviewReasons'])
nv=collections.Counter(k for a in A for k,v in a['views'].items() if v);ne=collections.Counter(k for a in A for k in a.get('extraViews',{}) )
svgs=[os.path.join(dp,f) for dp,_,fs in os.walk(ROOT+'/assets/svg') for f in fs];tot=sum(os.path.getsize(p) for p in svgs)
big=sorted(((os.path.getsize(p),p) for p in svgs),reverse=True)[:5]
files=len(raw);ok=sum(1 for r in raw if r['status']=='ok');withview=sum(1 for r in raw if any(v.get('svg') for v in r['views']))
nofront=[a['assetId'] for a in A if not a['views']['front']];noside=[a['assetId'] for a in A if not a['views']['leftSide'] and not a['views']['rightSide']]
uncls=[a['assetId'] for a in A if a['categoryId']=='unclassified'];low=[a['assetId'] for a in A if a['classification']['confidence'] in('medium','low','none')]
exc=collections.Counter(k for r in raw for v in r['views'] for k,n in v.get('excluded',{}).items() for _ in range(n))
L=[f"# 2단계 변환 보고서 ({datetime.date.today()})",
"## 요약",f"- 입력 DWG 파일: **{files}개** (정상 읽기 {ok}개 / 읽기 실패 {files-ok}개)",f"- SVG를 1개 이상 만든 DWG: **{withview}개**, 뷰 SVG 총 {len(svgs)}개 ({tot/1e6:.1f} MB)",
f"- 생성된 에셋: **{len(A)}개** (한 DWG에 여러 가구가 들어 있어 {len(A)-files+ (files-withview)}개 추가 분리)" ,
f"- 에셋 상태: ok {st['ok']} · ok-with-notes {st['ok-with-notes']} · review {st['review']} · failed {st['failed']}",
f"- 뷰 확보: 정면 {nv['front']}개 · 좌측면 {nv['leftSide']}개 · 우측면 {nv['rightSide']}개 (평면 {ne['top']}, 후면 {ne['back']}, 단면 {ne['section']}, 미분류 뷰 {sum(v for k,v in ne.items() if k.startswith('unknown'))})",
"- 처리하지 않은 파일: King-size-bed.dwg.crdownload(다운로드 중단 파일, 정상 DWG가 따로 있음), .webp 참고 이미지 2개",
"",
"## 대분류별 에셋 수",*[f"- {k}: {v}" for k,v in cat.most_common()],"",
"## 검수 사유 집계 (에셋 수가 아니라 사유 건수)",*[f"- {k}: {v}" for k,v in rs.most_common()],"",
"## 중요 한계",
"- DWG 원본은 3D 솔리드가 없는 2D 도면입니다(1단계 스캔). 이번 단계는 3D 변환을 하지 않았습니다.",
"- 좌측면도는 거의 없고 대부분 우측면도(rs)만 있습니다. 좌측면 필드는 비어 있으며, 대칭 반전으로 채우지 않았습니다.",
f"- 정면도가 없는 에셋 {len(nofront)}개, 좌·우측면 모두 없는 에셋 {len(noside)}개.",
f"- 선 단순화는 하지 않았습니다. 끝점이 맞닿은 LINE을 하나의 경로로 이었고(형상 불변), 좌표는 긴 변=1000 기준 소수 둘째 자리로 정규화했습니다. 스플라인·타원은 촘촘히 샘플링한 폴리라인입니다. 채움(HATCH)은 이번 단계에서 제외했습니다(원본 {exc.get('HATCH',0)}건).",
f"- 제외한 요소(치수·문자·지시선 등): "+', '.join(f'{k} {v}' for k,v in exc.most_common(8)),
f"- 단위가 지정되지 않은 파일은 뷰 크기에 따라 mm/cm로 가정하고 'units-unspecified-assumed-*'로 표시했습니다.",
"",
"## 분류 신뢰도",f"- 파일명만으로 확정하기 어려운 항목(신뢰도 medium/low/none): {len(low)}개",f"- 미분류(검토 필요): {', '.join(uncls) or '없음'}","",
"## 가장 큰 SVG",*[f"- {b/1e6:.2f} MB {os.path.relpath(p,ROOT)}" for b,p in big],""]
# HOUSE 무변경
h=ROOT+'/../'
before=open('/mnt/user-data/work/house-before.md5').read().split('\n')
now=subprocess.run("cd /mnt/user-data/outputs && md5sum index.html public/assets/house-objects/manifest.json public/assets/house-objects/category-config.json && find public -type f | wc -l",shell=True,capture_output=True,text=True).stdout.split('\n')
L+=["## 기존 HOUSE 탭 무변경 검증","- 작업 전/후 md5·파일 수 비교: "+("**동일**" if before[:4]==now[:4] else "**차이 있음 → 확인 필요**"),*[f"  - {x}" for x in now if x]]
open(ROOT+'/logs/report.md','w').write('\n'.join(L));print('\n'.join(L[:14]));print(L[-5:])
