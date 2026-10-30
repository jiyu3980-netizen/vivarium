#!/bin/bash
# 배포 전 게이트: 모든 시험을 새 서버에서 돌리고 하나라도 실패하면 exit 1
# 사용: bash run-gate.sh  (필요: /tmp/srv/start.sh = 로컬 wrangler 서버, 8765 정적서버)
T=$(cd "$(dirname "$0")" && pwd); S=$T/../../section-server/tests; FAIL=0
fresh(){ ps -eo pid,args | grep "[w]orkerd\|[w]rangler" | awk '{print $1}' | xargs -r kill; sleep 2; (setsid nohup bash /tmp/srv/start.sh >/tmp/srv/out.log 2>&1 &); sleep 14; }
curl -s localhost:8765 >/dev/null || (cd /mnt/user-data/outputs && setsid nohup python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1
run(){ n=$1; shift; fresh; out=$(timeout 400 "$@" 2>&1); rc=$?; f=$(echo "$out" | grep -c '^FAIL'); echo "[$n] rc=$rc FAIL=$f ok=$(echo "$out" | grep -c '^ok')"; echo "$out" | grep '^FAIL' | head -5; [ $rc -ne 0 -o $f -gt 0 ] && FAIL=1; }
cd $S; for t in api relation-lock scenario4; do run server-$t node $t.test.js; done
cd $T; for t in engine-determinism-test joint-test ko-test love-join-test; do run site-$t node $t.js; done
for t in ui-integration-test ui-neighbor-rel-test ui-romance-test ui-visit-full-test ui-visit-latency-test ui-visit-nogeo-test; do run $t node $t.js; done
[ $FAIL -eq 0 ] && echo "GATE PASS" || echo "GATE FAIL"; exit $FAIL
