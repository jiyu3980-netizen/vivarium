#!/bin/sh
# 전체 재생성: (1) DWG 재추출은 별도 실행 `node extract.mjs <srcDir> <out>` (2) 아래 순서로 라이브러리 생성
# usage: sh rebuild_all.sh <추출된 svg 폴더> <extract-raw.json>
set -e
cd "$(dirname "$0")"
rm -rf ../assets/svg && cp -r "$1" ../assets/svg && cp "$2" ../logs/extract-raw.json
python3 build_library.py
python3 r3_apply.py
python3 make_fills.py
python3 make_preview.py
python3 make_report.py
