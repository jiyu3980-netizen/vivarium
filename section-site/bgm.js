/* 배경음악 — 상단 메뉴(.vnav) 맨 끝의 작은 스피커 버튼 하나만 둔다. 도면·캐릭터 위에는 아무것도 올라가지 않는다.
   · 버튼을 누르면 작은 패널(켜기/끄기 + 볼륨)이 메뉴 바로 아래에 잠깐 열리고, 바깥을 누르거나 몇 초 지나면 닫힌다.
   · 브라우저 정책상 소리는 사용자가 화면을 처음 누르거나 키를 누른 뒤에 시작한다(기본: 켜짐, 볼륨 25%, 천천히 커짐).
   · 설정(켜짐/꺼짐·볼륨)은 이 브라우저에만 저장(localStorage). 저장이 막혀 있어도 동작한다.
   · 탭이 가려지면 멈췄다가 돌아오면 이어서 재생. 시스템에서 '동작 줄이기'를 켰으면 움직이는 막대 표시를 쓰지 않는다. */
(function(){
'use strict';
const SRC='bgm/eerie-ambient.mp3',KEY='viv.bgm.v1',DEF={on:true,vol:.25};
let st=Object.assign({},DEF);try{const o=JSON.parse(localStorage.getItem(KEY));if(o&&typeof o==='object'){if(typeof o.on==='boolean')st.on=o.on;if(isFinite(o.vol))st.vol=Math.min(1,Math.max(0,+o.vol))}}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}};
function start(nav){
let au=null,fade=0,unlocked=false,pop=null,closeT=0;
const ICON=`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9.5v5h3.6l4.9 3.9V5.6L7.6 9.5H4z" fill="currentColor"/><g class="bgm-w" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M15.6 9.3a3.6 3.6 0 0 1 0 5.4"/><path d="M18.1 7a7 7 0 0 1 0 10"/></g><path class="bgm-x" d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>`;
const btn=document.createElement('button');btn.type='button';btn.id='bgmBtn';btn.className='bgm';btn.innerHTML=ICON;btn.setAttribute('aria-haspopup','dialog');btn.setAttribute('aria-expanded','false');nav.appendChild(btn);
function audio(){if(au)return au;au=new Audio(SRC);au.loop=true;au.preload='auto';au.volume=0;return au}
function setFade(to,ms,done){cancelAnimationFrame(fade);const a=audio(),v0=a.volume,t0=performance.now();const step=n=>{const u=ms>0?Math.min(1,(n-t0)/ms):1;a.volume=Math.min(1,Math.max(0,v0+(to-v0)*u));if(u<1)fade=requestAnimationFrame(step);else if(done)done()};fade=requestAnimationFrame(step)}
function play(){const a=audio();const p=a.play();if(p&&p.then)p.then(()=>{setFade(st.vol,a.volume<.01?2200:300);paint()}).catch(()=>{unlocked=false;paint()});else{setFade(st.vol,1500)}}
function stop(){if(!au)return;setFade(0,350,()=>{au.pause();paint()})}
function paint(){const playing=!!(au&&!au.paused)&&st.on;btn.classList.toggle('on',st.on);btn.classList.toggle('playing',playing);btn.classList.toggle('off',!st.on);
  btn.title=st.on?'배경음악 (켜짐) — 눌러서 조절':'배경음악 (꺼짐) — 눌러서 조절';btn.setAttribute('aria-label',btn.title);if(pop){const sw=pop.querySelector('.bgm-sw'),rg=pop.querySelector('input');sw.setAttribute('aria-checked',st.on);sw.textContent=st.on?'끄기':'켜기';rg.value=Math.round(st.vol*100);rg.style.setProperty('--v',Math.round(st.vol*100)+'%');rg.disabled=!st.on;pop.classList.toggle('off',!st.on)}}
function setOn(on){st.on=!!on;save();if(on){if(unlocked)play();else paint()}else stop();paint()}
function setVol(v){st.vol=Math.min(1,Math.max(0,v));save();if(au&&!au.paused&&st.on){cancelAnimationFrame(fade);au.volume=st.vol}paint()}
/* 첫 사용자 동작 뒤에 시작(자동재생 차단 대응) */
function unlock(){if(unlocked)return;unlocked=true;['pointerdown','keydown','touchend'].forEach(e=>removeEventListener(e,unlock,true));if(st.on)play()}
['pointerdown','keydown','touchend'].forEach(e=>addEventListener(e,unlock,{capture:true,passive:true}));
document.addEventListener('visibilitychange',()=>{if(!au)return;if(document.hidden){au.pause()}else if(st.on&&unlocked)play()});
/* 작은 조절 패널 */
function openPop(){if(pop)return;pop=document.createElement('div');pop.className='bgm-pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','배경음악');
  pop.innerHTML=`<div class="bgm-t">배경음악 <small>Eerie Ambient</small></div><div class="bgm-r"><button type="button" class="bgm-sw" role="switch"></button><input type="range" min="0" max="100" step="1" aria-label="볼륨"></div>`;
  document.body.appendChild(pop);place();paint();btn.setAttribute('aria-expanded','true');
  const sw=pop.querySelector('.bgm-sw'),rg=pop.querySelector('input');sw.onclick=()=>{setOn(!st.on);unlock();if(st.on&&unlocked)play();keep()};
  rg.oninput=()=>{setVol(rg.value/100);if(!st.on)setOn(true);keep()};pop.addEventListener('pointerdown',keep);keep()}
function closePop(){clearTimeout(closeT);if(pop){pop.remove();pop=null}btn.setAttribute('aria-expanded','false')}
function keep(){clearTimeout(closeT);closeT=setTimeout(closePop,5000)}
function place(){if(!pop)return;const r=btn.getBoundingClientRect(),w=pop.offsetWidth||190;pop.style.top=Math.round(r.bottom+8)+'px';pop.style.left=Math.round(Math.min(innerWidth-w-8,Math.max(8,r.right-w)))+'px'}
btn.onclick=e=>{e.stopPropagation();pop?closePop():openPop()};
document.addEventListener('pointerdown',e=>{if(pop&&!pop.contains(e.target)&&e.target!==btn&&!btn.contains(e.target))closePop()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pop){closePop();btn.focus()}});
addEventListener('resize',place);
paint();
}
/* 상단 메뉴는 viv.js 가 만들므로 생길 때까지 기다림 */
{const n=document.querySelector('.vnav');if(n)start(n);else{const mo=new MutationObserver(()=>{const m=document.querySelector('.vnav');if(m){mo.disconnect();start(m)}});mo.observe(document.documentElement,{childList:true,subtree:true})}}
})();
