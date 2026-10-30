# 2단계 변환 보고서 (2026-10-23)
## 요약
- 입력 DWG 파일: **405개** (정상 읽기 405개 / 읽기 실패 0개)
- SVG를 1개 이상 만든 DWG: **405개**, 뷰 SVG 총 2667개 (69.3 MB)
- 생성된 에셋: **506개** (한 DWG에 여러 가구가 들어 있어 101개 추가 분리)
- 에셋 상태: ok 187 · ok-with-notes 114 · review 205 · failed 0
- 뷰 확보: 정면 482개 · 좌측면 295개 · 우측면 295개 (평면 473, 후면 9, 단면 6, 미분류 뷰 35)
- 처리하지 않은 파일: King-size-bed.dwg.crdownload(다운로드 중단 파일, 정상 DWG가 따로 있음), .webp 참고 이미지 2개

## 대분류별 에셋 수
- furniture: 96
- kitchen: 68
- plants: 60
- decor: 41
- architectural-elements: 36
- appliances: 35
- storage-lifestyle: 32
- lighting: 29
- electronics: 28
- bathroom: 27
- other: 17
- hobby: 12
- food-drink: 10
- clothing: 7
- animals: 6
- vehicle: 2

## 검수 사유 집계 (에셋 수가 아니라 사유 건수)
- leftSide-derived-by-mirror: 250
- missing-side: 211
- split-from-multi-item-sheet: 113
- classification-medium: 71
- size-unit-corrected-by-class-range: 65
- stray-geometry-or-excess-margin: 53
- size-estimated-from-class-range: 51
- multi-item-in-view?: 51
- rightSide-derived-by-mirror: 43
- multi-variant-in-file: 41
- missing-front: 24
- loose-model-geometry: 23
- unclassified-geometry-present: 19
- width-mismatch-front-vs-top: 18
- extreme-aspect: 5
- rightSide-not-paired(1!=4): 4
- classification-uncertain: 3
- hatch-skipped: 2
- too-few-lines: 2
- rightSide-not-paired(1!=2): 1

## 중요 한계
- DWG 원본은 3D 솔리드가 없는 2D 도면입니다(1단계 스캔). 이번 단계는 3D 변환을 하지 않았습니다.
- 좌측면도는 거의 없고 대부분 우측면도(rs)만 있습니다. 좌측면 필드는 비어 있으며, 대칭 반전으로 채우지 않았습니다.
- 정면도가 없는 에셋 24개, 좌·우측면 모두 없는 에셋 211개.
- 선 단순화는 하지 않았습니다. 끝점이 맞닿은 LINE을 하나의 경로로 이었고(형상 불변), 좌표는 긴 변=1000 기준 소수 둘째 자리로 정규화했습니다. 스플라인·타원은 촘촘히 샘플링한 폴리라인입니다. 채움(HATCH)은 이번 단계에서 제외했습니다(원본 6건).
- 제외한 요소(치수·문자·지시선 등): TEXT 36, MTEXT 13, ATTDEF 13, HATCH 6, POINT 4
- 단위가 지정되지 않은 파일은 뷰 크기에 따라 mm/cm로 가정하고 'units-unspecified-assumed-*'로 표시했습니다.

## 분류 신뢰도
- 파일명만으로 확정하기 어려운 항목(신뢰도 medium/low/none): 73개
- 미분류(검토 필요): 없음

## 가장 큰 SVG
- 1.54 MB assets/svg/hanging-vines/unknown-2.svg
- 1.37 MB assets/svg/hanging-vines/unknown-1.svg
- 0.97 MB assets/svg/Potted-Fern/top.svg
- 0.83 MB assets/svg/Potted-Fern/front.svg
- 0.75 MB assets/svg/climbing-plants/unknown-2.svg

## 기존 HOUSE 탭 무변경 검증
- 작업 전/후 md5·파일 수 비교: **동일**
  - 8fc350f12f4083d829e0dc10e51713a1  index.html
  - 06aeb909a8ca20529d48761aed844a68  public/assets/house-objects/manifest.json
  - 2d9fe4c81410f747af6d881fd60ab6b8  public/assets/house-objects/category-config.json
  - 709