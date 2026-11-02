#!/bin/bash
for p in $(ps -eo pid,args | grep "[w]orkerd\|[w]rangler" | awk '{print $1}'); do kill -9 $p 2>/dev/null; done
for i in $(seq 1 20); do curl -s -o /dev/null localhost:8787/api/health || break; sleep 1; done
(setsid nohup bash /tmp/srv/start.sh >/tmp/srv/out.log 2>&1 &)
for i in $(seq 1 40); do curl -s -o /dev/null localhost:8787/api/health && break; sleep 2; done; sleep 3
curl -s localhost:8787/api/health | cut -c1-60
