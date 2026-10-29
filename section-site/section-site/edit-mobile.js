/* v23.15 단면도 편집 — 모바일(≤900px) 전용 UI
   · 하단 탭 바(가구·건물·표현) + 하단 시트(비바리움 관찰 탭의 행동·관계·프로필 서랍과 같은 방식)
   · 도면에서 가구·벽·문 등을 고르면 속성창이 하단 시트로 뜨고, 도구 시트는 자동으로 접힘
   · 시트가 가리는 곳에 선택한 가구가 있으면 도면을 자동으로 위로 밀어 올림
   데스크톱 레이아웃·기능은 건드리지 않고 DOM 이벤트(탭 버튼 클릭)·SectionBridge 만 사용한다. */
(function(){
  const mq=matchMedia('(max-width:900px)'),$=(s,r)=>(r||document).querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const lib=$('#lib'),insp=$('#insp'),svg=$('#svg');if(!lib||!insp||!svg)return;
  const I=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const TABS=[['lib','가구',I('<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 11h18v6H3z"/><path d="M5 17v2M19 17v2"/>')],
    ['house','건물',I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>')],
    ['draw','표현',I('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>')]];
  const bar=document.createElement('nav');bar.id='mBar';bar.setAttribute('aria-label','도구');
  bar.innerHTML=TABS.map(([k,l,s])=>`<button type="button" data-t="${k}" aria-label="${l}">${s}<span>${l}</span></button>`).join('');
  document.body.appendChild(bar);
  const head=(t)=>{const d=document.createElement('div');d.className='m-sh';d.innerHTML=`<i class="m-grab"></i><b class="m-t">${t}</b><button type="button" class="m-x" aria-label="닫기">×</button>`;return d};
  const lh=head('가구'),ih=head('');lib.prepend(lh);insp.prepend(ih);
  const on=()=>mq.matches,B=document.body;
  const tabOf=()=>{const b=$('#lib .tabs button.on');return b?b.dataset.t:'lib'};
  const TITLE={lib:'가구',house:'건물',draw:'표현'};
  function paint(){$$('#mBar button').forEach(b=>b.classList.toggle('on',B.classList.contains('m-lib')&&b.dataset.t===tabOf()));$('.m-t',lh).textContent=TITLE[tabOf()]||'도구'}
  function closeLib(){B.classList.remove('m-lib');paint()}
  function deselect(){const SB=window.SectionBridge,S=window.__sec;if(SB&&SB.sel&&S){try{S.select(null)}catch(e){}}}
  function openLib(t){const cur=$('#lib .tabs button[data-t="'+t+'"]');if(cur&&!cur.classList.contains('on'))cur.click();deselect();B.classList.remove('m-insp');B.classList.add('m-lib');paint()}
  $$('#mBar button').forEach(b=>b.onclick=()=>{if(!on())return;if(B.classList.contains('m-lib')&&tabOf()===b.dataset.t)closeLib();else openLib(b.dataset.t)});
  $('.m-x',lh).onclick=closeLib;
  $('.m-x',ih).onclick=()=>{deselect();B.classList.remove('m-insp')};
  /* 선택 상태 ↔ 속성 시트 */
  let down=0,tm=0;
  const hasSel=()=>!!(window.SectionBridge&&window.SectionBridge.sel);
  function syncInsp(){clearTimeout(tm);tm=setTimeout(()=>{if(!on()||B.classList.contains('mode-viv'))return;
    if(down){return}
    if(hasSel()){B.classList.add('m-insp');B.classList.remove('m-lib');paint();reveal()}
    else B.classList.remove('m-insp')},60)}
  svg.addEventListener('pointerdown',()=>{down++});
  const up=()=>{down=Math.max(0,down-1);if(!down)syncInsp()};svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);
  new MutationObserver(syncInsp).observe($('#inspBody'),{childList:true});
  /* 시트에 가려지는 선택물을 도면 위쪽으로 밀어 올림 */
  function reveal(){requestAnimationFrame(()=>{const SB=window.SectionBridge;if(!SB||!SB.VP)return;const box=$('#svg .sel-box');if(!box)return;
    const r=box.getBoundingClientRect(),sr=svg.getBoundingClientRect(),sh=insp.getBoundingClientRect();if(!sh.height)return;
    const limit=Math.min(sh.top,sr.bottom)-14,top=sr.top+10;let dy=0;
    if(r.bottom>limit)dy=r.bottom-limit;if(r.top-dy<top)dy=Math.max(0,r.top-top);   // 위로 밀되 위쪽이 잘리지 않게
    if(dy>1){const k=SB.VP.w/sr.width;SB.VP.y+=dy*k;SB.applyVP()}})}
  /* 화면 폭이 바뀌어 PC 배치가 되면 시트 상태 해제 */
  const reset=()=>{if(!on()){B.classList.remove('m-lib','m-insp')}};mq.addEventListener?mq.addEventListener('change',reset):mq.addListener(reset);
  /* 도구 탭을 다른 방식으로 바꾸면 제목 갱신 */
  $$('#lib .tabs button').forEach(b=>b.addEventListener('click',()=>setTimeout(paint,0)));paint();
  /* 편집 탭으로 돌아올 때(관찰 탭에서 전환) 시트는 닫힌 상태로 */
  new MutationObserver(()=>{if(B.classList.contains('mode-viv')&&(B.classList.contains('m-lib')||B.classList.contains('m-insp')))B.classList.remove('m-lib','m-insp')}).observe(B,{attributes:true,attributeFilter:['class']});   // 있을 때만 지움(없는 클래스 remove 도 변경으로 잡혀 무한 반복되므로)
})();
