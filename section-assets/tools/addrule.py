#!/usr/bin/env python3
"""python3 addrule.py <asset>/<view> <최소면적> exclude 8 9 [include x y r ...]
faces.py 와 같은 번호 체계에서 번호의 시드점을 catalog/fill_rules.json 에 기록(이미 있으면 합침)."""
import sys,os,json,subprocess,re
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(HERE);P=ROOT+'/catalog/fill_rules.json'
key,minA,mode=sys.argv[1],sys.argv[2],sys.argv[3];rest=sys.argv[4:]
R=json.load(open(P)) if os.path.exists(P) else {}
e=R.setdefault(key,{'exclude':[],'include':[]})
if mode=='exclude':
    out=subprocess.run(['python3',HERE+'/faces.py',key,'/tmp/_f.png',minA],capture_output=True,text=True).stdout.split('\n')
    tab={int(l.split()[0]):(float(l.split()[1]),float(l.split()[2])) for l in out if l.strip()}
    for n in rest:
        p=list(tab[int(n)]);
        if p not in e['exclude']:e['exclude'].append(p)
elif mode=='include':
    v=[float(x) for x in rest]
    for i in range(0,len(v),3):e['include'].append([v[i],v[i+1],v[i+2]])
json.dump(R,open(P,'w'),indent=1);print(key,e)
