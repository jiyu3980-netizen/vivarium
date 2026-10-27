/* v21 관찰 화면 UX 보강 — 기존 DOM·이벤트(id/클래스)는 그대로 두고, 우측 상세 패널을 아이콘 레일+서랍(행동·관계·프로필)으로 재배치한다.
   기능 로직(viv.js)은 바꾸지 않고, 그려진 요소를 옮기기만 해서 기존 동작(행동 지정·프로필 자동저장·감정/관계·삭제 등)이 그대로 유지된다. */
(function(){
  const q=(s,r)=>(r||document).querySelector(s),qa=(s,r)=>[...(r||document).querySelectorAll(s)];
  const I=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const TABS=[['act','행동',I('<circle cx="12" cy="5" r="2"/><path d="M12 8v6M8 10l4-2 4 2M9 21l3-7 3 7"/>')],
    ['rel','관계',I('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>')],
    ['log','프로필',I('<path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6"/>')]];
  const mobile=()=>matchMedia('(max-width:900px)').matches;
  let wrap=null,tab='act',lastChar=null,busy=false,mo=null;
  function setOpen(o){if(!wrap)return;wrap.classList.toggle('vx-open',!!o);qa('.vx-rail button',wrap).forEach(b=>b.classList.toggle('on',!!o&&b.dataset.t===tab));wrap.dataset.tab=tab}
  function pick(t){if(wrap.classList.contains('vx-open')&&tab===t){setOpen(false);return}tab=t;setOpen(true)}
  function regroup(){
    const el=q('#vvDetail');if(!el||busy||q(':scope > .vx-head',el))return;
    const nodes=[...el.children];if(!nodes.length)return;busy=true;
    try{
      const P={act:[],rel:[],mov:[],log:[],more:[]};let head=null,pic=null,cur=null,seenH4=false,editBtns=null,picPen=null,fileIn=null;
      const hasChar=!!q('.vv-pic',el);
      nodes.forEach(n=>{
        if(n.tagName==='H3'){head=n;return}
        if(n.classList.contains('vv-pic')){pic=n;return}
        if(n.classList.contains('vv-pen-img')){picPen=n;return}
        if(n.tagName==='INPUT'&&n.id==='vdImgF'){picPen&&(picPen.dataset.f='1');fileIn=n;return}
        if(n.id==='vdKind'){P.log.push(n);return}   // 종류(사람/반려동물)도 프로필 탭으로
        if(n.tagName==='LABEL'&&q('#vdSz',n)){P.log.push(n);return}   // 크기(높이 cm)는 프로필 탭으로
        if(!hasChar){P.act.push(n);return}
        if(n.tagName==='H4'){seenH4=true;const t=n.textContent;cur=/직접 행동/.test(t)?'act':/프로필 해석/.test(t)?'log':/배치/.test(t)?'mov':(cur||'more');P[cur].push(n);return}
        if(n.classList.contains('vv-btns')&&q('#vdDel',n)){editBtns=n;return}   // 프로필 수정·삭제 버튼은 '프로필' 서랍으로
        if(!seenH4){if(n.classList.contains('vv-phrase')||n.tagName==='DL')P.act.push(n);else P.rel.push(n);return}
        P[cur||'more'].push(n)});
      const dl=P.act.find(n=>n.tagName==='DL');   // 프로필 항목은 '프로필' 서랍으로
      if(dl){const dd=q('dd.vv-prof',dl);if(dd){const dt=dd.previousElementSibling,d2=document.createElement('dl');d2.append(dt,dd);P.log.unshift(d2)}}
      if(editBtns)P.log.push(editBtns);
      const note=q('.vv-side > .vv-note');if(note){const c=document.createElement('p');c.className='hint';c.innerHTML=note.innerHTML;P.more.push(c)}
      P.log.push(...P.more);P.more=[];   // 더보기 탭은 없앰: 남는 안내 문구는 프로필 탭 맨 아래로
      const hd=document.createElement('div');hd.className='vx-head';
      if(pic){const w=document.createElement('div');w.className='vx-picw';w.appendChild(pic);if(picPen)w.appendChild(picPen);if(fileIn)w.appendChild(fileIn);hd.appendChild(w)}if(head)hd.appendChild(head);else{const h=document.createElement('h3');h.textContent='상세';hd.appendChild(h)}
      const x=document.createElement('button');x.type='button';x.className='vx-x';x.textContent='×';x.title='서랍 닫기';x.setAttribute('aria-label','서랍 닫기');x.onclick=()=>setOpen(false);hd.appendChild(x);
      const body=document.createElement('div');body.className='vx-body';
      TABS.forEach(([k])=>{const s=document.createElement('section');s.className='vx-pane';s.dataset.t=k;
        if(P[k].length)P[k].forEach(n=>s.appendChild(n));else{const e=document.createElement('p');e.className='vx-empty';e.textContent=hasChar?'표시할 내용이 없어요':'캐릭터를 먼저 선택하세요';s.appendChild(e)}
        body.appendChild(s)});
      el.textContent='';el.append(hd,body);
    }finally{busy=false}
    const sel=q('.vv-chip.on'),id=sel&&sel.dataset.id;
    if(id&&id!==lastChar&&!mobile()){tab='act';setOpen(true)}   // 데스크톱: 새 캐릭터를 고르면 서랍이 열림(모바일은 장면을 가리지 않게 탭을 눌러야 열림)
    lastChar=id||null;
    setOpen(wrap.classList.contains('vx-open'))}
  function tooltips(){qa('#vvChars .vv-chip').forEach(b=>{const n=q('b',b),s=q('small',b);b.title=(n?n.textContent:'')+(s&&s.textContent?' — '+s.textContent:'')})}
  function init(){
    const w=q('#viv .vv-wrap');if(!w||w.dataset.vx)return;w.dataset.vx='1';wrap=w;
    const rail=document.createElement('nav');rail.className='vx-rail';rail.setAttribute('aria-label','캐릭터 상세');
    rail.innerHTML=TABS.map(([k,l,s])=>`<button type="button" data-t="${k}" title="${l}" aria-label="${l}">${s}<span>${l}</span></button>`).join('');
    w.appendChild(rail);qa('button',rail).forEach(b=>b.onclick=()=>pick(b.dataset.t));
    const pal=q('.vv-pal',w);if(pal){const sm=q('small',pal);if(sm)sm.onclick=()=>pal.classList.toggle('vx-open');qa('button',pal).forEach(b=>b.addEventListener('click',()=>pal.classList.remove('vx-open')))}
    const rf=q('#vvRefresh',w);if(rf){rf.title='도면 새로고침';rf.setAttribute('aria-label','도면 새로고침')}
    const d=q('#vvDetail',w);mo=new MutationObserver(()=>regroup());mo.observe(d,{childList:true});regroup();
    const ch=q('#vvChars',w);new MutationObserver(tooltips).observe(ch,{childList:true});tooltips();
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&wrap.classList.contains('vx-open')&&!q('dialog[open]'))setOpen(false)});
    wrap.dataset.tab=tab}
  const sec=q('#viv')||document.body;new MutationObserver(()=>{if(!wrap||!wrap.isConnected){wrap=null;init()}}).observe(sec,{childList:true});   // #viv 의 직계 자식만 감시(화면 갱신 때 부담 없음)
  init();
})();
