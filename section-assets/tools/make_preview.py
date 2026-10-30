#!/usr/bin/env python3
"""catalog/assets.json → preview/index.html (SVG는 <img loading=lazy>로 필요할 때만 로드, 메타데이터만 인라인)"""
import json,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A=json.load(open(ROOT+'/catalog/assets.json'));C=json.load(open(ROOT+'/catalog/category-config.json'))
slim=[]
for a in A['assets']:
    slim.append({k:a.get(k) for k in ['assetId','nameKo','nameEn','categoryId','subcategoryId','status','reviewReasons','defaultSizeCm','classification','errors']}|{'views':{k:(v['svg'] if v else None) for k,v in a['views'].items()},'extra':{k:v['svg'] for k,v in a.get('extraViews',{}).items()},'src':a['source']['file']})
html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>단면도 가구 에셋 미리보기</title>
<style>:root{--bg:#faf8f4;--fg:#26222b;--mut:#6b6475;--ok:#2e8b57;--warn:#c27c0e;--bad:#c0392b}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:10px 14px;z-index:5;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
header input,header select{padding:6px 8px;border:1px solid #ccc;border-radius:6px;font:inherit}#sum{color:var(--mut);margin-left:auto}
#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;padding:14px}
.card{background:#fff;border:1px solid #e3ddd3;border-radius:8px;padding:8px;cursor:pointer;display:flex;flex-direction:column;gap:4px}
.th{height:140px;display:flex;align-items:center;justify-content:center;background:#fdfcf9;border-radius:4px}.th img{max-width:100%;max-height:100%}
.nm{font-weight:600}.id{color:var(--mut);font-size:12px;word-break:break-all}.chips{display:flex;gap:4px;flex-wrap:wrap}
.chip{font-size:11px;padding:1px 6px;border-radius:9px;background:#eee}.chip.on{background:#dff1e6;color:#1e6b41}.chip.off{background:#fbe3e0;color:#9c2b20;text-decoration:line-through}
.st-ok{color:var(--ok)}.st-ok-with-notes{color:var(--ok)}.st-review{color:var(--warn)}.st-failed{color:var(--bad)}
dialog{max-width:96vw;width:1100px;border:1px solid #bbb;border-radius:10px}dialog .vs{display:flex;flex-wrap:wrap;gap:10px}dialog figure{margin:0;width:250px;text-align:center}dialog img{max-width:250px;max-height:250px;background:#fdfcf9;border:1px solid #eee}
pre{white-space:pre-wrap;font-size:12px;background:#f3f0ea;padding:8px;border-radius:6px;max-height:220px;overflow:auto}</style></head><body>
<header><b>단면도 가구 에셋</b><input id="q" placeholder="이름·ID·태그 검색"><select id="cat"><option value="">대분류 전체</option></select><select id="st"><option value="">상태 전체</option><option>ok</option><option>ok-with-notes</option><option>review</option><option>failed</option></select>
<label><input type="checkbox" id="nf"> 정면도 없음만</label><label><input type="checkbox" id="ns"> 측면도 없음만</label><span id="sum"></span></header><div id="grid"></div><dialog id="dlg"></dialog>
<script id="meta" type="application/json">__META__</script><script id="cats" type="application/json">__CATS__</script>
<script>
const M=JSON.parse(document.getElementById('meta').textContent),C=JSON.parse(document.getElementById('cats').textContent).categories,P='../';
const cn=Object.fromEntries(C.map(c=>[c.id,c.nameKo]));const $=s=>document.querySelector(s);
C.forEach(c=>$('#cat').insertAdjacentHTML('beforeend',`<option value="${c.id}">${c.nameKo}</option>`));
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const thumb=a=>a.views.front||a.views.rightSide||a.views.leftSide||a.extra.top||Object.values(a.extra)[0];
function render(){const q=$('#q').value.toLowerCase(),cat=$('#cat').value,st=$('#st').value,nf=$('#nf').checked,ns=$('#ns').checked;
 const L=M.filter(a=>(!cat||a.categoryId===cat)&&(!st||a.status===st)&&(!nf||!a.views.front)&&(!ns||(!a.views.leftSide&&!a.views.rightSide))&&(!q||(a.assetId+a.nameKo+a.nameEn+a.src).toLowerCase().includes(q)));
 $('#sum').textContent=`${L.length} / ${M.length}개 · 성공(ok+notes) ${M.filter(a=>a.status.startsWith('ok')).length} · 검토 ${M.filter(a=>a.status==='review').length} · 실패 ${M.filter(a=>a.status==='failed').length}`;
 $('#grid').innerHTML=L.map(a=>{const t=thumb(a);const ch=['front','leftSide','rightSide'].map(k=>`<span class="chip ${a.views[k]?'on':'off'}">${{front:'정면',leftSide:'좌측',rightSide:'우측'}[k]}</span>`).join('');
  return `<div class="card" data-id="${a.assetId}"><div class="th">${t?`<img loading="lazy" decoding="async" src="${P+t}" alt="">`:'<i>뷰 없음</i>'}</div><div class="nm">${esc(a.nameKo)}</div><div class="id">${esc(a.assetId)}</div><div>${esc(cn[a.categoryId]||a.categoryId)} › ${esc(a.subcategoryId)}</div><div class="chips">${ch}</div><div class="st-${a.status}">● ${a.status}${a.reviewReasons&&a.reviewReasons.length?` (${a.reviewReasons.length})`:''}</div></div>`}).join('')}
$('#grid').onclick=e=>{const c=e.target.closest('.card');if(!c)return;const a=M.find(x=>x.assetId===c.dataset.id);
 const figs=[...Object.entries(a.views),...Object.entries(a.extra)].filter(([k,v])=>v).map(([k,v])=>`<figure><img loading="lazy" src="${P+v}"><figcaption>${k}</figcaption></figure>`).join('');
 $('#dlg').innerHTML=`<h3>${esc(a.nameKo)} <small>${esc(a.assetId)}</small></h3><div class="vs">${figs||'뷰 없음'}</div><p>원본: ${esc(a.src)} · 크기(cm): ${esc(JSON.stringify(a.defaultSizeCm))}</p><p>분류 근거: ${esc(a.classification&&a.classification.basis)} (${esc(a.classification&&a.classification.confidence)})</p><pre>${esc((a.reviewReasons||[]).join('\\n')||'검수 사유 없음')}${a.errors&&a.errors.length?'\\n'+esc(a.errors.join('\\n')):''}</pre><form method="dialog"><button>닫기</button></form>`;$('#dlg').showModal()};
['q','cat','st','nf','ns'].forEach(i=>$('#'+i).addEventListener('input',render));render();
</script></body></html>'''
html=html.replace('__META__',json.dumps(slim,ensure_ascii=False).replace('</','<\\/')).replace('__CATS__',json.dumps(C,ensure_ascii=False))
os.makedirs(ROOT+'/preview',exist_ok=True);open(ROOT+'/preview/index.html','w').write(html);print('preview',len(html)//1024,'KB')
