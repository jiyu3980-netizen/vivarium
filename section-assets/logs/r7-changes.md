# 7차(신규 DWG) 적용 로그

- 뷰 재지정: cadgrid-acacia-tree-elevation-in: unknown-1 → front
- 뷰 재지정: cadgrid-classic-fireplace-with-mantel-elevation-in: unknown-1 → front
- 뷰 재지정: cadgrid-layered-canopy-tree-elevation-in: unknown-1 → front
- 뷰 재지정: cadgrid-stone-clad-double-sided-fireplace-elevation-in: unknown-1 → front
- 뷰 재지정: cadgrid-traditional-fireplace-with-chimney-breast-01-elevation-in: unknown-1 → front
- 분리: pvc-pipes → pvc-pipes-1 … 14 (배관 부속 14종, 정면만; 도면 틀 사각형 제외)
- 정리: toyota-tacoma 의 높이 0 인 떠돌이 선 2개 삭제
- 분리: 5-bedside-tables → 5-bedside-tables-1, 5-bedside-tables-2, 5-bedside-tables-3, 5-bedside-tables-4, 5-bedside-tables-5 (5개; front:5덩어리, rightSide:5덩어리, top:5덩어리)
- 분리: cake-stand → cake-stand-1, cake-stand-2 (2개; front:2덩어리, top:2덩어리)
- 분리: coat-rack-stand → coat-rack-stand-1, coat-rack-stand-2, coat-rack-stand-3 (3개; front:3덩어리, top:3덩어리)
- 분리: kitchen-shelf → kitchen-shelf-1, kitchen-shelf-2, kitchen-shelf-3, kitchen-shelf-4 (4개; front:4덩어리, top:4덩어리)
- 분리: shoes-rack → shoes-rack-1, shoes-rack-2, shoes-rack-3 (3개; front:3덩어리, rightSide:3덩어리, top:3덩어리)
- 좌우 반전 생성: 34개 에셋
- 정리: 참조되지 않는 SVG 24개 삭제(사용하지 않은 중복 뷰, 이전 채움 파일)

## 기존 에셋 수정
- 삭제: fireplaces-4 (벽난로 4) — 카탈로그 항목과 SVG 폴더 삭제(원본 DWG는 그대로)
- 선 삭제: commercial-dishwasher-with-tables/front: 본체에서 멀리 떨어진 왼쪽 선 제거 (4개 경로)
- 재구성: violin — 정면=DWG 평면 블록(세워 둔 모습), 측면=DWG 측면 블록을 세워서(반시계 90°)
- 재구성: chess-board — 정면=DWG 측면 블록, 크기 단위 인치(×2.54) → {'width': 35.6, 'height': 10.8, 'depth': 35.6}
- 선 삭제: breakfast-tray/front: 좌우 기둥 선분 50개 제거 → 기본 크기 {'width': 51.4, 'height': 36.4, 'depth': 38.7}
- 선 삭제: breakfast-tray/front: 좌우 기둥 선분 54개 제거 → 기본 크기 {'width': 51.4, 'height': 16.1, 'depth': 38.7}


## 7차 추가 메모
- trolley-table-1/front: 빨간 테두리 대상이 아니어서 원본 그대로 유지(잘못 지웠던 것을 복원).
- breakfast-tray/front: 좌우 기둥 선 제거(탑 끝면은 유지).
- 면 채움 규칙: catalog/fill_rules.json (exclude=채우지 않음, include=채움, fine=잔 요철 보존). 가스레인지 front에 fine 적용.
- 모든 svg 경로를 assets/svg/<assetId>/<파일> 소문자 ID 기준으로 통일(대소문자 구분 저장소 대응 – 바이올린/체스판이 안 보이던 원인으로 추정). 바이올린·체스판 재생성.
- 마젠타 표시(9번 이미지) 항목은 식별하지 못해 include 규칙 없음.
## 8차 변경
- 정면·측면이 없던 에셋 11개 삭제(arch-top-window, diya-oil-lamps-v1, garden-radish-plant-v2, mini-fridge-smeg, motorhome, water-dispenser, climbing-plants, flexible-duct, hanging-vines, mini-fridge, whisky-bottle). 원본 DWG는 건드리지 않음.
- 신규 DWG 43개 중 135개 에셋 등록(tools/r8_build.py): 문·창호·지붕·난간은 문·창호 카테고리, 여러 개가 한 파일에 든 병·촛대·책·꽃병·기둥 장식은 개별 에셋으로 분리, 클래식 소파 세트는 안락의자/3인 소파로 분리.
- old Bathroom Sink 1·2: 'old Bathroom Sink side' 도면을 두 에셋의 측면(우측, 좌측은 좌우 반전)으로 적용.
- 등록하지 못한 것: Plants.dwg(추출 오류), Low leafy shrub cluster plan·Radial fan-palm canopy plan(평면도만 있음), single door.dwg(용도 불명), Free Single Window Shutter 평판 2종, 중복·도면틀·무늬 조각 등.
