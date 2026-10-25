(()=>{'use strict';
let LIB=window.LIB||'../section-assets/';const $=s=>document.querySelector(s);const NS='http://www.w3.org/2000/svg';
const DEF_B={w:900,f:2,h:270,s:20,t:20,roof:'gable',rh:150};
const DEF_LW={out:2,inn:1,cut:2.6,auto:true,bDash:false,bOp:.75};
const LAYERS=[['ground','지면·기초'],['back','뒷벽 문·창(입면)'],['roof','지붕'],['struct','벽·슬래브(절단)'],['open','문·창문(개구부)'],['stairs','계단'],['terr','테라스 난간'],['items','가구'],['labels','방 이름·치수'],['levels','레벨 표시(층 높이)']];
const MATS=[['line','기본 사선'],['concrete','콘크리트'],['brick','벽돌'],['wood','목재'],['insul','단열재'],['steel','철골'],['none','흰색(해칭 없음)']];
const FLOOR_MIN=15; // 자동 통일 기준에서 제외하는 아주 작은 가구(cm)
let S={v:2,title:'',b:{...DEF_B},parts:[],items:[],terr:[]};let sel=null,hist=[],fut=[],A=[],AM={},CATS=[],shown=60,curF=0;
const uid=()=>Math.random().toString(36).slice(2,9);
const clone=o=>JSON.parse(JSON.stringify(o));
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const msg=(t)=>{$('#msg').textContent=t;clearTimeout(msg.t);msg.t=setTimeout(()=>$('#msg').textContent='',3500)};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
/* ---------- 저장 데이터 정규화 (옛 저장본도 그대로 열림) ---------- */
function norm(o){o.v=2;o.b={...DEF_B,...(o.b||{})};const b=o.b;
 b.mat={wall:'line',slab:'none',roof:'roof',...(b.mat||{})};b.hsc=b.hsc||1;b.hang=+b.hang||0;b.hw=b.hw||1;b.bb=Math.min(3,Math.max(0,Math.round(+b.bb||0)));b.void=!!b.void;
 const sk=Array.isArray(b.sk)?b.sk:[];b.sk=Array.from({length:b.f+1},(_,k)=>+sk[k]||b.s);const wp=Array.isArray(b.wp)?b.wp:[];b.wp=Array.from({length:b.f},(_,k)=>wp[k]||'plain');if(!b.wpv){b.wp=b.wp.map(w=>w==='grain'?'plain':w);b.wpv=2}
 const hs=Array.isArray(b.hs)?b.hs:[];b.hs=Array.from({length:b.f},(_,k)=>+hs[k]||b.h);
 o.lw={...DEF_LW,...(o.lw||{})};o.layers={ground:1,back:1,roof:1,struct:1,open:1,stairs:1,items:1,terr:1,labels:1,levels:0,...(o.layers||{})};
 b.rz=Math.max(0,Math.min(150,+b.rz||0));
 const ex=Array.isArray(b.ext)?b.ext:[];b.ext=Array.from({length:b.f},(_,k)=>{const e=ex[k];return e&&isFinite(+e.l)&&isFinite(+e.r)&&+e.r-+e.l>=100?{l:+e.l,r:+e.r}:{l:0,r:b.w}});
 o.terr=(Array.isArray(o.terr)?o.terr:[]).filter(t=>t&&isFinite(+t.x0)&&isFinite(+t.x1)&&+t.x1-+t.x0>=20).map(t=>({id:t.id||('t'+Math.random().toString(36).slice(2,8)),f:Math.max(0,Math.min(b.f,Math.round(+t.f)||0)),x0:+t.x0,x1:+t.x1,rail:['iron','vict','brick'].includes(t.rail)?t.rail:'iron',slab:t.slab!==false}));
 o.parts=(o.parts||[]).map(p=>({t:12,mat:'line',...p}));o.ops=o.ops||[];o.stairs=o.stairs||[];o.rooms=o.rooms||{};
 o.items=(o.items||[]).map(i=>({cs:'proj',...i}));if(o.title===undefined||o.title==='SECTION A — 우리 집 단면도')o.title='';return o}
S=norm(S);
const XL=k=>{const e=S.b.ext&&S.b.ext[k];return e?e.l:0};
const XR=k=>{const e=S.b.ext&&S.b.ext[k];return e?e.r:S.b.w};
const gE=()=>-(S.b.rz||0); // 지면 높이(cm, 1층 바닥 기준). 1층 바닥이 지면보다 높으면 음수
function bounds(){const b=S.b;let l=0,r=b.w;for(let k=0;k<b.f;k++){l=Math.min(l,XL(k));r=Math.max(r,XR(k))}
 for(const t of S.terr){l=Math.min(l,t.x0);r=Math.max(r,t.x1)}
 for(const a of S.stairs)if(a.type==='outer'){const g=stairGeo(a);if(g&&g.xs){l=Math.min(l,g.xs[0]);r=Math.max(r,g.xs[1])}}
 return {l,r}}
/* ---------- 기하 ---------- */
const fh=k=>(S.b.hs&&S.b.hs[k])||S.b.h;
const BB=()=>S.b.bb||0; // 지하 층수 (층 번호 0 = 가장 아래 층)
const lvl=k=>{let e=0;for(let j=0;j<k;j++)e+=fh(j);for(let j=0;j<BB();j++)e-=fh(j);return e}; // k번째 층 마감 바닥 높이(cm), 지상 1층 = 0
const fname=k=>k<BB()?'B'+(BB()-k):(k-BB()+1)+'F';
const fnameKo=k=>k<BB()?'지하 '+(BB()-k)+'층':(k-BB()+1)+'층';
const EH=()=>lvl(S.b.f);
const sl=k=>(S.b.sk&&S.b.sk[k])||S.b.s; // k번째 슬래브(k층 바닥 아래) 두께
const nearLevel=e=>{let best=0,bd=1e9;for(let k=0;k<S.b.f;k++){const d=Math.abs(e-lvl(k));if(d<bd){bd=d;best=k}}return {k:best,d:bd}};
function subIv(a,b,cuts){let segs=[[a,b]];for(const [c0,c1] of cuts){const n=[];for(const [x0,x1] of segs){if(c1<=x0||c0>=x1){n.push([x0,x1]);continue}if(c0>x0)n.push([x0,c0]);if(c1<x1)n.push([c1,x1])}segs=n}return segs.filter(g=>g[1]-g[0]>0.01)}
/* ---------- 뷰포트 ---------- */
const svg=$('#svg');let VP={x:-200,y:-800,w:1300};
function applyVP(){const ho=document.querySelector('.hnd');const r=svg.getBoundingClientRect();const h=VP.w*(r.height||600)/(r.width||800);svg.setAttribute('viewBox',`${VP.x} ${VP.y} ${VP.w} ${h}`);const z=Math.round((r.width||800)/VP.w*100);$('#hud').textContent=`확대 ${z}%  ·  1칸 = 100cm`;if(ho){const it=cur();if(it)placeHandle(it.x+it.w/2,-it.e)}}
function fit(){const b=S.b,top=EH()+(b.roof==='gable'?b.rh:b.roof==='flat'?30:0);const dep=-lvl(0)+b.s;const BN=bounds(),W=(BN.r-BN.l)+500,H=top+dep+380;const r=svg.getBoundingClientRect();const k=Math.max(W/(r.width||800),H/(r.height||600));VP.w=k*(r.width||800);const vh=k*(r.height||600);VP.x=(BN.l+BN.r)/2-VP.w/2;VP.y=-(top+120)-(vh-(top+dep+380))/2;applyVP()}
function toWorld(ev){const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse());return {x:q.x,y:q.y}}
/* ---------- SVG 에셋 캐시 (선·실루엣 경로를 읽어 stroke 로 직접 그림) ---------- */
const ART={};let rq=0;
function schedule(){if(rq)return;rq=requestAnimationFrame(()=>{rq=0;render()})}
function parseArt(t){const m=/viewBox="([^"]+)"/.exec(t);const vb=m?m[1].trim().split(/\s+/).map(Number):[0,0,1000,1000];let d='',fd='',od='';
 for(const pm of t.matchAll(/<path\b[^>]*>/g)){const tag=pm[0];const dm=/ d="([^"]*)"/.exec(tag);if(!dm)continue;if(/class="o"/.test(tag))od+=dm[1];else if(/fill="#fff"/.test(tag))fd+=dm[1];else d+=dm[1]}
 return {w:vb[2],h:vb[3],d,fd,od}}
function art(url,quiet){const a=ART[url];if(a){if(!a.ready&&!quiet)a.pend=true;return a.ready?a:null}const ent=ART[url]={ready:false,pend:!quiet};
 fetch(LIB+url).then(r=>{if(!r.ok)throw new Error(r.status);return r.text()}).then(t=>{const pend=ent.pend;ART[url]={ready:true,...parseArt(t)};if(pend)schedule()}).catch(()=>{const pend=ent.pend;ART[url]={ready:true,w:1000,h:1000,d:'',fd:'',od:'',err:true};if(pend)schedule()});return null}
/* ---------- 선 굵기: 외곽 ≤ 크기의 4%, 내부 ≤ 외곽의 절반, 자동 통일 ---------- */
function weights(){const L=S.lw,res={};const sz=i=>Math.max(i.w,i.h);
 let Wo0=L.out;
 if(L.auto){const m=Math.min(...S.items.filter(i=>i.cs!=='behind'&&sz(i)>=FLOOR_MIN).map(sz));if(isFinite(m))Wo0=Math.min(L.out,.04*m)}
 let Wi0=Math.min(L.inn,Wo0/2);
 S.items.forEach(i=>{const base=i.cs==='cut'?Math.max(L.cut,Wo0):i.cs==='behind'?Wo0*.6:Wo0;const wo=Math.min(base,.04*sz(i));res[i.uid]={wo,wi0:Math.min(L.auto?L.inn:L.inn,wo/2)}});
 if(L.auto){const m=Math.min(Wi0,...Object.values(res).map(r=>r.wi0));Wi0=m}
 for(const u in res){const r=res[u];r.wi=L.auto?Math.min(Wi0,r.wo/2):r.wi0;delete r.wi0}
 res._o=Wo0;res._i=Wi0;return res}
/* ---------- 재질 해칭 ---------- */
function hatchDefs(defs,k,INK,ang,hw){const Wd=x=>+(x*hw).toFixed(2);
 const P=(id,w,h,rot,fill)=>{const p=mk('pattern',{id,width:w,height:h,patternUnits:'userSpaceOnUse',patternTransform:`rotate(${rot+ang}) scale(${k})`},defs);mk('rect',{width:w,height:h,fill:fill||'#fff'},p);return p};
 let p=P('hat_line',9,9,45);mk('line',{x1:0,y1:0,x2:0,y2:9,stroke:INK,'stroke-width':Wd(1.1)},p);
 p=P('hat_roof',7,7,-28);mk('line',{x1:0,y1:0,x2:0,y2:7,stroke:INK,'stroke-width':Wd(1.3)},p);
 p=P('hat_concrete',16,16,0);mk('line',{x1:0,y1:16,x2:16,y2:0,stroke:INK,'stroke-width':Wd(.7)},p);[[3,4],[11,10],[6,13],[13,3]].forEach(([x,y])=>mk('circle',{cx:x,cy:y,r:1,fill:INK},p));
 p=P('hat_brick',5,5,45);mk('line',{x1:0,y1:0,x2:0,y2:5,stroke:INK,'stroke-width':Wd(.9)},p);
 p=P('hat_wood',18,10,0);mk('path',{d:'M0 2H18M0 8H18M4 8q5-5 10 0',fill:'none',stroke:INK,'stroke-width':Wd(.8)},p);
 p=P('hat_insul',20,12,0);mk('path',{d:'M0 6q2.5-6 5 0t5 0t5 0t5 0',fill:'none',stroke:INK,'stroke-width':Wd(.8)},p);
 p=P('hat_steel',5,5,45,'#e4e4e1');mk('path',{d:'M0 0V5M0 0H5',fill:'none',stroke:INK,'stroke-width':Wd(.9)},p)}
const matFill=m=>(!m||m==='none')?'#fff':`url(#hat_${m})`;
/* ---------- 계단 기하 ---------- */
const STAIR_ASSET={spiral:{id:'grand-spiral-staircase',slab:.218,void:[.68,1]},glass:{id:'staircase-glass-railing',slab:.226,void:[0,1]}}; // slab: 에셋 그림에서 위층 바닥 위치(위에서부터 비율)
function outerGeo(a){const b=S.b,f=a.f;if(!(f>=0&&f<b.f))return null;
 const eB=a.from>=0&&a.from<b.f&&a.from!==f?lvl(a.from):gE(),eT=lvl(f);if(Math.abs(eT-eB)<8)return null;
 const rise=Math.abs(eT-eB),up=eT>eB,side=a.side==='L'?'L':'R';const edge=side==='L'?XL(f):XR(f);
 const run=Math.max(60,a.run||Math.round(rise*1.7)),n=a.n>=3?Math.min(60,Math.round(a.n)):Math.max(3,Math.round(rise/17.5)),rs=rise/n,tr=run/(n-1);
 const out=side==='L'?-1:1;                      // 건물 밖으로 향하는 방향
 const eLo=Math.min(eB,eT);
 const poly2=[[edge+out*run,eLo]];
 for(let i=0;i<n;i++){const xo=edge+out*(run-i*tr),h=eB+(eT-eB)*(i+1)/n;poly2.push([xo,h]);if(i<n-1)poly2.push([edge+out*(run-(i+1)*tr),h])}
 poly2.push([edge,eT]);poly2.push([edge,eLo]);
 const rail=[[edge+out*run,eB+(eT-eB)/n+90],[edge,eT+90]];
 const xa=Math.min(edge,edge+out*run),xb=Math.max(edge,edge+out*run);
 return {poly:poly2,rail,land:null,thin:[],voidX:null,xs:[xa,xb],outer:true}}
function stairGeo(a){if(a.type==='outer')return outerGeo(a);const b=S.b,f=a.f;if(!(f>=0&&f<b.f-1))return null;const s=sl(f+1);const e0=lvl(f),rise=fh(f),dir=a.dir>=0?1:-1,x0=a.x,type=a.type||'straight';
 const sa=STAIR_ASSET[type];
 if(sa){const as=AM[sa.id];const sv=a.sv||'auto';const vkey=type==='glass'&&sv==='auto'?(dir>0?'rightSide':'leftSide'):'front';const v=as&&as.views[vkey];if(!v)return null;
  const h=rise/(1-sa.slab);const w=a.w>0?a.w:h*(v.aspect||1);const flip=((type==='spiral'&&dir<0)!==(sv==='back'));
  const vx=flip?[x0+w*(1-sa.void[1]),x0+w*(1-sa.void[0])]:[x0+w*sa.void[0],x0+w*sa.void[1]];
  return {asset:{id:sa.id,view:vkey,x:x0,w,h,e:e0,flip},voidX:vx,poly:[],rail:[],thin:[],land:null}}
 const riseF=type==='straight'?rise:rise/2;const n=a.n>=3?Math.min(40,Math.round(a.n)):Math.max(3,Math.round(riseF/17.5)),rs=riseF/n;const run=Math.max(60,a.run||240),tr=run/(n-1),D=22;
 const xt=x0+dir*run,et=e0+riseF;const poly=[[x0,e0]];
 for(let i=0;i<n;i++){poly.push([x0+dir*i*tr,e0+(i+1)*rs]);if(i<n-1)poly.push([x0+dir*(i+1)*tr,e0+(i+1)*rs])}
 poly.push([xt,et-D]);if(D>=rs){const u=Math.min(1,(D-rs)/(riseF-rs));poly.push([x0+(xt-x0)*u,e0])}else poly.push([x0,e0+rs-D]);
 const g={poly,rail:[[x0,e0+rs+90],[xt,et+90]],land:null,thin:[],voidX:null,xt,et,rs};
 const Ld=Math.max(60,a.land||100);
 if(type==='straight'){const u=(et-s-210-e0-rs)/(riseF-rs);if(u<1){const xa=x0+(xt-x0)*Math.max(0,u);g.voidX=[Math.min(xa,xt),Math.max(xa,xt)]}}
 else{const xl=xt+dir*Ld;g.land=[Math.min(xt,xl),Math.max(xt,xl),et-15,et];g.voidX=[Math.min(x0,xl),Math.max(x0,xl)];
  if(type==='U'){const pts=[[xt,et]];for(let i=0;i<n;i++){pts.push([xt-dir*i*tr,et+(i+1)*rs]);if(i<n-1)pts.push([xt-dir*(i+1)*tr,et+(i+1)*rs])}g.thin.push(pts);g.thin.push([[xt,et+rs-D],[x0,e0+rise-D]]);g.thin.push([[x0,e0+rise],[xt,e0+rise]])}
  else{const xa=Math.min(xt,xl),xb=Math.max(xt,xl);g.thin.push([[xa,et],[xb,et],[xb,e0+rise],[xa,e0+rise],[xa,et]]);for(let i=1;i<n;i++)g.thin.push([[xa,et+i*rs],[xb,et+i*rs]])}}
 return g}
/* ---------- 렌더 ---------- */
function mk(n,a,p){const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e}
const OPT={grid:false,fill:true,dims:false};try{Object.assign(OPT,JSON.parse(localStorage.getItem('sectionSite.opt')||'{}'))}catch(e){}
function grainPattern(defs,id,base,n,seed){const p=mk('pattern',{id,width:80,height:80,patternUnits:'userSpaceOnUse'},defs);mk('rect',{width:80,height:80,fill:base},p);let r=seed;const rnd=()=>(r=(r*16807)%2147483647)/2147483647;
 for(let i=0;i<n;i++)mk('circle',{cx:(rnd()*80).toFixed(1),cy:(rnd()*80).toFixed(1),r:(.5+rnd()*1.3).toFixed(2),fill:rnd()>.35?'rgba(0,0,0,.10)':'rgba(255,255,255,.28)'},p)}
const pts2=(a)=>a.map(p=>p[0].toFixed(1)+','+(-p[1]).toFixed(1)).join(' ');
let LASTW={},MASKN=0;
function renderItem(it,gp,WT,pseudo){const gg=mk('g',{...(pseudo?{'data-id':it.uid}:{class:'itm','data-uid':it.uid}),transform:`translate(${it.x-it.w/2} ${-it.e-it.h})`+(it.flip?` translate(${it.w} 0) scale(-1 1)`:'')},gp);
 const a=AM[it.assetId];const v=a&&a.views[it.view]||(a&&Object.values(a.views).find(Boolean));
 if(!v){mk('rect',{width:it.w,height:it.h,fill:'rgba(200,0,0,.1)',stroke:'#c00'},gg);return}
 const A0=art(v.svg),F0=(OPT.fill&&v.fill)?art(v.fill):null;
 if(!A0||(OPT.fill&&v.fill&&!F0)){mk('rect',{width:it.w,height:it.h,fill:'rgba(0,0,0,.04)',stroke:'#999','stroke-dasharray':'4 4','stroke-width':1},gg);return}
 const sx=it.w/A0.w,sy=it.h/A0.h,k=(sx+sy)/2,w=WT[it.uid]||(()=>{const wo=Math.min(S.lw.out,.04*Math.max(it.w,it.h));return {wo,wi:Math.min(S.lw.inn,wo/2)}})();const col=it.cs==='behind'?'#555':'#1c1c1c';const dsh=(it.cs==='behind'&&S.lw.bDash)?{'stroke-dasharray':`${(9/k).toFixed(2)} ${(6/k).toFixed(2)}`}:{};
 const sc=mk('g',{transform:`scale(${sx} ${sy})`,...(it.cs==='behind'?{opacity:S.lw.bOp}:{})},gg);
 if(F0&&F0.fd){mk('path',{d:F0.fd,fill:'#fff','fill-rule':'evenodd','pointer-events':'all'},sc)}
 else mk('rect',{width:A0.w,height:A0.h,fill:'#fff','fill-opacity':0,'pointer-events':'all'},sc);
 const L={fill:'none',stroke:col,'stroke-linecap':'round','stroke-linejoin':'round',...dsh};
 if(A0.d)mk('path',{d:A0.d,...L,'stroke-width':(w.wi/k).toFixed(3),'pointer-events':'none'},sc);
 /* 바깥 윤곽의 굵은 선: 흰 채움 파일의 윤곽(래스터에서 근사한 선)을 그대로 긋지 않는다 — 그러면 곡선 안쪽을 가로지르는 새 직선이 생긴다.
    대신 원본 선(곡선 포함)을 굵게 다시 그리되, 윤곽 근처에 있는 부분만 보이도록 마스크로 자른다. */
 if(F0&&F0.od&&A0.d){const mid='mk_'+String(it.uid).replace(/[^A-Za-z0-9_]/g,'')+'_'+(++MASKN);const df=svg.querySelector('defs');
  const band=(2.4*w.wo/k)+0.01*Math.max(A0.w,A0.h),pad=band;
  const m=mk('mask',{id:mid,maskUnits:'userSpaceOnUse',x:-pad,y:-pad,width:A0.w+2*pad,height:A0.h+2*pad},df);
  /* 윤곽(od)은 래스터 근사라 곡선 위를 직선으로 가로지를 수 있다 → 채움 영역 바깥에 있는 원본 선도 바깥 윤곽으로 본다:
     흰 바탕 → 채움 안쪽은 검게(숨김) → 윤곽 근처 띠는 다시 흰색(보임) */
  if(F0.fd){mk('rect',{x:-pad,y:-pad,width:A0.w+2*pad,height:A0.h+2*pad,fill:'#fff'},m);for(const sp of F0.fd.split(/(?=M)/))if(sp.trim())mk('path',{d:sp,fill:'#000'},m)}  // 서브패스마다 따로 채움 = 구멍도 윤곽 안쪽으로 취급(안쪽 장식선이 굵어지지 않게)
  mk('path',{d:F0.od,fill:'none',stroke:'#fff','stroke-width':band.toFixed(3),'stroke-linejoin':'round'},m);
  mk('path',{d:A0.d,...L,'stroke-width':(w.wo/k).toFixed(3),mask:`url(#${mid})`,'pointer-events':'none'},sc)}
 else if(A0.d)mk('path',{d:A0.d,...L,'stroke-width':(w.wo/k).toFixed(3),'pointer-events':'none'},sc)}
function drawRailing(par,t,Wp,Wi,INK){
 const x0=t.x0,x1=t.x1,e=lvl(t.f),Wd=x1-x0,Y=v=>-(e+v);
 const g=mk('g',{'data-id':t.id,fill:'none',stroke:INK,'stroke-linejoin':'round','stroke-linecap':'round'},par);
 mk('rect',{x:x0,y:Y(105),width:Wd,height:105,fill:'#fff','fill-opacity':0,stroke:'none','pointer-events':'all'},g); // 잡기 쉬운 투명 영역
 if(t.rail==='iron'){const H=100;                       // 철제: 위·아래 가로대 + 가는 세로살 + 굵은 기둥(끝에 둥근 장식)
  mk('line',{x1:x0,y1:Y(H),x2:x1,y2:Y(H),'stroke-width':Wp},g);mk('line',{x1:x0,y1:Y(H-5),x2:x1,y2:Y(H-5),'stroke-width':Wi},g);
  mk('line',{x1:x0,y1:Y(9),x2:x1,y2:Y(9),'stroke-width':Wp},g);mk('line',{x1:x0,y1:Y(3),x2:x1,y2:Y(3),'stroke-width':Wi},g);
  const n=Math.max(1,Math.round(Wd/13));let d='';for(let i=0;i<=n;i++){const x=x0+Wd*i/n;d+=`M${x.toFixed(1)} ${Y(9)}V${Y(H-5)}`}
  mk('path',{d,'stroke-width':Wi*.85},g);
  const pn=Math.max(1,Math.round(Wd/150));for(let i=0;i<=pn;i++){const x=x0+Wd*i/pn;mk('line',{x1:x,y1:Y(0),x2:x,y2:Y(H+5),'stroke-width':Wp*1.7},g);mk('circle',{cx:x,cy:Y(H+10),r:3.6,fill:'#fff','stroke-width':Wi},g)}}
 else if(t.rail==='vict'){const H=95,pb=12,pc=9;        // 빅토리안 대리석: 받침(plinth) + 항아리형 난간동자 + 두툼한 윗덮개 + 네모 기둥
  const hb=H-pb-pc;
  mk('rect',{x:x0,y:Y(pb),width:Wd,height:pb,fill:'#fff','stroke-width':Wp},g);mk('line',{x1:x0,y1:Y(pb-4),x2:x1,y2:Y(pb-4),'stroke-width':Wi},g);
  const n=Math.max(1,Math.round((Wd-30)/20)),pn=Math.max(1,Math.round(Wd/160));
  const vase=(cx)=>{const r=y=>3.2+4.2*Math.exp(-Math.pow((y-25)/11,2))+1.9*Math.exp(-Math.pow((y-hb*.83)/3.6,2))+(y<4?1.6:0)+(y>hb-4?1:0);const L=[],Rr=[];for(let y=0;y<=hb+.01;y+=hb/36){L.push([cx-r(y),y]);Rr.push([cx+r(y),y])}
   const pts=[...L,...Rr.reverse()].map(q=>q[0].toFixed(1)+' '+Y(pb+q[1]).toFixed(1));return 'M'+pts.join('L')+'Z'};
  let d='';for(let i=0;i<n;i++){const cx=x0+15+(Wd-30)*(n===1?.5:i/(n-1));d+=vase(cx)}
  mk('path',{d,fill:'#fff','stroke-width':Wi*1.1},g);
  mk('rect',{x:x0-3,y:Y(H),width:Wd+6,height:pc,fill:'#fff','stroke-width':Wp},g);mk('line',{x1:x0-3,y1:Y(H-3.5),x2:x1+3,y2:Y(H-3.5),'stroke-width':Wi},g);
  for(let i=0;i<=pn;i++){const x=Math.min(x1-7,Math.max(x0+7,x0+Wd*i/pn));mk('rect',{x:x-7,y:Y(H),width:14,height:H-pb,fill:'#fff','stroke-width':Wp},g);mk('path',{d:`M${x-7} ${Y(H-8)}H${x+7}M${x-7} ${Y(pb+9)}H${x+7}`,'stroke-width':Wi},g);mk('path',{d:`M${x-9} ${Y(H+0)}L${x} ${Y(H+10)}L${x+9} ${Y(H+0)}Z`,fill:'#fff','stroke-width':Wi},g)}}
 else{const H=90,cp=8,pw=Math.min(26,Wd/3);           // 벽돌: 속이 찬 낮은 벽 + 줄눈(가는 선, 어긋나게) + 윗덮개 + 양끝 벽돌 기둥
  mk('rect',{x:x0,y:Y(H-cp),width:Wd,height:H-cp,fill:'#fff','stroke-width':Wp},g);
  let d='';const ch=7.5;let c=0;for(let y=ch;y<H-cp-1;y+=ch,c++){d+=`M${x0} ${Y(y)}H${x1}`}
  c=0;for(let y=0;y<H-cp-1;y+=ch,c++){const y2=Math.min(H-cp,y+ch);for(let x=x0+(c%2?11:22);x<x1-1;x+=22)d+=`M${x.toFixed(1)} ${Y(y)}V${Y(y2)}`}
  mk('path',{d,'stroke-width':Wi*.5,stroke:'#555'},g);
  mk('rect',{x:x0-3,y:Y(H),width:Wd+6,height:cp,fill:'#fff','stroke-width':Wp},g);
  for(const px of [x0,x1-pw]){mk('rect',{x:px,y:Y(H+8),width:pw,height:H,fill:'#fff','stroke-width':Wp},g);mk('rect',{x:px-3,y:Y(H+16),width:pw+6,height:8,fill:'#fff','stroke-width':Wp},g)}}
 return g}
function paperDefs(defs){
 const P=(id,w,h)=>mk('pattern',{id,width:w,height:h,patternUnits:'userSpaceOnUse'},defs);let p;
 // 나무 벽: 세로 널판 3장 + 결 + 옹이
 p=P('wp_wood',90,200);[['#d6bd95',0],['#ccb089',30],['#dbc4a0',60]].forEach(([c,x])=>mk('rect',{x,y:0,width:30,height:200,fill:c},p));
 mk('path',{d:'M0 0V200M30 0V200M60 0V200',stroke:'#7f6038','stroke-width':1,fill:'none'},p);
 mk('path',{d:'M8 0q3 50 0 100t0 100M20 0q-3 40 0 90t0 110M38 0q3 60 0 100t0 100M52 0q-3 50 0 100t0 100M68 0q3 40 0 90t0 110M80 0q-3 60 0 100t0 100',stroke:'rgba(90,60,30,.28)','stroke-width':.8,fill:'none'},p);
 mk('path',{d:'M0 70h30M30 130h30M60 40h30M0 180h30',stroke:'#7f6038','stroke-width':.8},p);
 mk('ellipse',{cx:16,cy:110,rx:3,ry:5,fill:'none',stroke:'rgba(90,60,30,.5)','stroke-width':.8},p);mk('ellipse',{cx:74,cy:150,rx:3,ry:4.5,fill:'none',stroke:'rgba(90,60,30,.5)','stroke-width':.8},p);
 // 꽃무늬 벽지
 p=P('wp_floral',90,90);mk('rect',{width:90,height:90,fill:'#f1e9e1'},p);
 const flower=(cx,cy,c)=>{for(let k=0;k<5;k++){const a=k*Math.PI*2/5-Math.PI/2;mk('circle',{cx:(cx+Math.cos(a)*7).toFixed(1),cy:(cy+Math.sin(a)*7).toFixed(1),r:5.2,fill:c,stroke:'rgba(120,60,70,.35)','stroke-width':.6},p)}mk('circle',{cx,cy,r:3.4,fill:'#f0cf70',stroke:'rgba(120,90,20,.4)','stroke-width':.6},p)};
 [[22,22,'#e3a3ae'],[68,56,'#c9b3d6'],[-0,60,'#e3a3ae'],[90,60,'#e3a3ae']].forEach(([x,y,c])=>flower(x,y,c));
 [[45,40,30],[10,80,-40],[78,16,50],[45,84,-20]].forEach(([x,y,r])=>mk('ellipse',{cx:x,cy:y,rx:7,ry:3,fill:'#a9be98',transform:`rotate(${r} ${x} ${y})`,opacity:.9},p));
 [[40,10],[8,40],[60,80],[84,30]].forEach(([x,y])=>mk('circle',{cx:x,cy:y,r:1.6,fill:'#d9c3b4'},p));
 // 철제 패널(리벳)
 p=P('wp_metal',120,120);mk('rect',{width:120,height:120,fill:'#c3c8cc'},p);
 for(let y=6;y<120;y+=9)mk('line',{x1:0,y1:y,x2:120,y2:y,stroke:'rgba(255,255,255,.35)','stroke-width':.8},p);
 mk('rect',{x:3,y:3,width:114,height:114,fill:'none',stroke:'#80878c','stroke-width':1.4},p);
 [[10,10],[110,10],[10,110],[110,110],[60,10],[60,110]].forEach(([x,y])=>mk('circle',{cx:x,cy:y,r:2.4,fill:'#a2a9ae',stroke:'#656b70','stroke-width':.8},p));
 // 네모 타일
 p=P('wp_tile',36,36);mk('rect',{width:36,height:36,fill:'#f6f6f3'},p);mk('path',{d:'M1.5 1.5H34.5V34.5',fill:'none',stroke:'rgba(255,255,255,.9)','stroke-width':1.2},p);
 mk('path',{d:'M0 0.7H36M0.7 0V36',stroke:'#b4b4ad','stroke-width':1.4,fill:'none'},p)}
const WP=[['plain','흰색 (기본)'],['grain','회색 입자'],['wood','나무 벽'],['floral','꽃무늬'],['metal','철제'],['tile','네모 타일']];
const wpFill=k=>k==='grain'?'url(#wallg)':k==='plain'?'#ffffff':`url(#wp_${k})`;
function render(){const b=S.b,N=b.f,E=EH(),t=b.t,s=b.s,W=b.w,INK='#1c1c1c',L=S.lw,LY=S.layers,B=BB();svg.innerHTML='';
 const BN=bounds();const WT=weights();LASTW=WT;const Wp=Math.min(L.out,Math.max(WT._o,.3)),Wi=WT._i;
 const defs=mk('defs',{},svg);hatchDefs(defs,b.hsc||1,INK,b.hang||0,b.hw||1);paperDefs(defs);
 grainPattern(defs,'wallg','#e6e6e3',45,7);grainPattern(defs,'groundg','#8d8d89',90,11);
 const pen=mk('filter',{id:'pen',x:'-2%',y:'-2%',width:'104%',height:'104%'},defs);mk('feTurbulence',{type:'fractalNoise',baseFrequency:'.035',numOctaves:2,seed:3,result:'n'},pen);mk('feDisplacementMap',{in:'SourceGraphic',in2:'n',scale:3.2,xChannelSelector:'R',yChannelSelector:'G'},pen);
 const lay=(id,a)=>{const g=mk('g',a||{},svg);g.setAttribute('data-layer',id);if(!LY[id])g.style.display='none';return g};
 if(OPT.grid){const gr=mk('g',{stroke:'rgba(0,0,0,.09)','stroke-width':1},svg);for(let x=-1000;x<=W+1000;x+=100)mk('line',{x1:x,y1:-E-700,x2:x,y2:-lvl(0)+700,'vector-effect':'non-scaling-stroke'},gr);for(let y=lvl(0)-700;y<=E+700;y+=100)mk('line',{x1:-1000,y1:-y,x2:W+1000,y2:-y,'vector-effect':'non-scaling-stroke'},gr)}
 // 지면·기초 (실내 벽면보다 먼저 그려서 지하층 실내가 흙에 가려지지 않게 함)
 const gG=lay('ground');mk('rect',{x:-6000,y:-gE(),width:14000,height:3000+(-lvl(0))+gE(),fill:'url(#groundg)'},gG);
 const fo=mk('g',{fill:'#fff',stroke:INK,'stroke-width':1.4,'vector-effect':'non-scaling-stroke'},gG);
 {const l0=XL(0),w0=XR(0)-XL(0);[l0+w0*0.12,l0+w0*0.88-160].forEach(x=>mk('rect',{x:Math.round(x),y:-(lvl(0)-sl(0)),width:160,height:90,'vector-effect':'non-scaling-stroke'},fo))}
 mk('line',{x1:-6000,y1:-gE(),x2:8000,y2:-gE(),stroke:INK,'stroke-width':2,'vector-effect':'non-scaling-stroke'},gG);
 // 실내 뒷벽면(벽지): 층마다 다르게 고를 수 있음
 const wallBg=mk('g',{},svg);
 for(let k=0;k<N;k++){const y0=lvl(k),y1=lvl(k+1)-sl(k+1);mk('rect',{x:XL(k)+t,y:-y1,width:XR(k)-XL(k)-2*t,height:Math.max(1,y1-y0),fill:wpFill(b.wp[k])},wallBg)}
 // 뒷벽(단면 뒤쪽 벽면)의 문·창문: 입면으로 보이는 가는 선
 const gBk=lay('back');
 for(const o of S.ops){if(o.on!=='back'||o.f<0||o.f>=N)continue;const e0=lvl(o.f)+o.sill,x0=o.x-o.w/2,gB=mk('g',{'data-id':o.id,stroke:INK,'stroke-width':Wp,'stroke-linejoin':'round'},gBk);
  mk('rect',{x:x0,y:-(e0+o.h),width:o.w,height:o.h,fill:'#fbfbfa'},gB);
  if(o.kind==='window'){mk('rect',{x:x0+4,y:-(e0+o.h-4),width:o.w-8,height:o.h-8,fill:'rgba(255,255,255,.8)','stroke-width':Wi},gB);mk('path',{d:`M${o.x} ${-(e0+4)}V${-(e0+o.h-4)}M${x0+4} ${-(e0+o.h/2)}H${x0+o.w-4}`,fill:'none','stroke-width':Wi},gB)}
  else{mk('rect',{x:x0+7,y:-(e0+o.h-7),width:o.w-14,height:o.h-7,fill:'none','stroke-width':Wi},gB);mk('circle',{cx:x0+o.w-16,cy:-(e0+o.h*.48),r:2.6,fill:INK,stroke:'none'},gB)}}
 const rf=lay('roof',{filter:'url(#pen)'}),d=18;
 const tl=XL(N-1),tr=XR(N-1);
 if(b.roof==='gable'){const A_=[tl-30,-E],C=[(tl+tr)/2,-E-b.rh],B_=[tr+30,-E];mk('path',{d:`M${A_} L${C} L${B_} L${B_[0]} ${B_[1]+d} L${C[0]} ${C[1]+d} L${A_[0]} ${A_[1]+d} Z`,fill:matFill(b.mat.roof),stroke:INK,'stroke-width':L.cut*.7,'stroke-linejoin':'round'},rf)}
 else if(b.roof==='flat'){mk('rect',{x:tl-30,y:-E-22,width:tr-tl+60,height:22,fill:matFill(b.mat.roof),stroke:INK,'stroke-width':L.cut*.7},rf)}
 // 계단: 바닥(슬래브) 뒤에 그려서, 계단이 있어도 바닥이 끊기지 않고 이어져 보이게 함
 const stp=lay('stairs');const stc=mk('g',{filter:'url(#pen)',stroke:INK,'stroke-width':L.cut,'stroke-linejoin':'round'},stp);
 const dtS=mk('g',{fill:'none',stroke:INK,'stroke-width':Wp,'stroke-linejoin':'round','stroke-linecap':'round'},stp);
 for(const a of S.stairs){const g=stairGeo(a);if(!g)continue;
  if(g.asset){const q=g.asset;renderItem({uid:a.id,assetId:q.id,view:q.view,x:q.x+q.w/2,e:q.e,w:q.w,h:q.h,flip:q.flip,cs:'proj'},stp,WT,true);continue}
  mk('polygon',{points:pts2(g.poly),fill:matFill(a.mat||'concrete'),'data-id':a.id},stc);
  if(g.land)mk('rect',{x:g.land[0],y:-g.land[3],width:g.land[1]-g.land[0],height:g.land[3]-g.land[2],fill:matFill(a.mat||'concrete'),'data-id':a.id},stc);
  const gs=mk('g',{'data-id':a.id},dtS);mk('polyline',{points:pts2(g.rail),'stroke-width':Wi},gs);
  g.thin.forEach(pl=>mk('polyline',{points:pts2(pl),'stroke-width':Wi,stroke:'#444'},gs))}
 // 구조체 — 절단되는 부분: 굵은 선 + 재질 해칭
 const st=lay('struct',{filter:'url(#pen)',stroke:INK,'stroke-width':L.cut,'stroke-linejoin':'round'});
 const R=(x,e0,w,h,fill,id)=>{if(h>.01&&w>.01)mk('rect',{x,y:-(e0+h),width:w,height:h,fill,...(id?{'data-id':id}:{})},st)};
 const opsOn=(on,f)=>S.ops.filter(o=>o.on===on&&(f===undefined||o.f===f)).map(o=>[lvl(o.f)+o.sill,lvl(o.f)+o.sill+o.h]);
 const wallFill=matFill(b.mat.wall);
 {const wy0=Math.min(lvl(0)-sl(0),gE());
  for(const on of ['L','R']){const xo=k=>on==='L'?XL(k):XR(k)-t;let k=0;
   while(k<N){let j=k;while(j+1<N&&xo(j+1)===xo(k))j++;const ya=k===0?wy0:lvl(k)-sl(k),yb=j===N-1?E:lvl(j+1)-sl(j+1);
    for(const [a0,a1] of subIv(ya,yb,opsOn(on)))R(xo(k),a0,t,a1-a0,wallFill,'wall');k=j+1}}
  if(gE()<lvl(0)-sl(0)-0.5)R(XL(0),gE(),XR(0)-XL(0),lvl(0)-sl(0)-gE(),wallFill,'wall')} // 지면보다 높은 1층 바닥 밑 기초 벽체
 for(let k=0;k<=N;k++){const voids=(b.void&&k>=1)?S.stairs.filter(a=>a.f===k-1).map(a=>stairGeo(a)).filter(g=>g&&g.voidX).map(g=>g.voidX):[];
  const sp=k===0?[XL(0),XR(0)]:k===N?[XL(N-1),XR(N-1)]:[Math.min(XL(k-1),XL(k)),Math.max(XR(k-1),XR(k))];
  for(const [x0,x1] of subIv(sp[0],sp[1],voids)){R(x0,lvl(k)-sl(k),x1-x0,sl(k),matFill(b.mat.slab),'wall');if(b.mat.slab==='none')mk('line',{x1:x0+2,y1:-(lvl(k)-sl(k)/2),x2:x1-2,y2:-(lvl(k)-sl(k)/2),stroke:'#555','stroke-width':L.cut*.4,'stroke-dasharray':'7 5'},st)}}
 for(const q of S.terr){if(q.slab!==false&&q.f>=0&&q.f<=N)R(q.x0,lvl(q.f)-sl(q.f),q.x1-q.x0,sl(q.f),matFill(b.mat.slab),q.id)}
 for(const p of S.parts){const k=p.f;if(k<0||k>=N)continue;for(const [a0,a1] of subIv(lvl(k),lvl(k+1)-sl(k+1),opsOn(p.id)))R(p.x-p.t/2,a0,p.t,a1-a0,matFill(p.mat),p.id)}
 // 문·창문(벽에 뚫린 곳): 창 유리 = 한 줄, 창틀·문틀 = 작은 단면
 const dt=lay('open',{fill:'none',stroke:INK,'stroke-width':Wp,'stroke-linejoin':'round','stroke-linecap':'round'});
 const hostX=o=>o.on==='L'?[XL(o.f),XL(o.f)+t]:o.on==='R'?[XR(o.f)-t,XR(o.f)]:(()=>{const p=S.parts.find(q=>q.id===o.on);return p?[p.x-p.t/2,p.x+p.t/2]:null})();
 for(const o of S.ops){if(o.on==='back'||o.f<0||o.f>=N)continue;const hx=hostX(o);if(!hx)continue;const e0=lvl(o.f)+o.sill,cx=(hx[0]+hx[1])/2,gO=mk('g',{'data-id':o.id,fill:'#fff'},dt);
  mk('rect',{x:hx[0],y:-(e0+o.h),width:hx[1]-hx[0],height:o.h,fill:'rgba(255,255,255,.01)',stroke:'none'},gO);
  if(o.kind==='window'){mk('path',{d:`M${cx} ${-e0}V${-(e0+o.h)}`,'stroke-width':Wi},gO);mk('rect',{x:hx[0]-3,y:-(e0+4),width:hx[1]-hx[0]+6,height:4,'stroke-width':Wp},gO);mk('rect',{x:hx[0],y:-(e0+o.h),width:hx[1]-hx[0],height:4,'stroke-width':Wp},gO)}
  else{mk('rect',{x:cx-2,y:-(e0+o.h-4),width:4,height:o.h-4,'stroke-width':Wp},gO);mk('rect',{x:hx[0],y:-(e0+o.h),width:hx[1]-hx[0],height:4,'stroke-width':Wp},gO)}}
 const trl=lay('terr');for(const q of S.terr)if(q.f>=0&&q.f<=N)drawRailing(trl,q,Wp,Wi,INK);
 // 층 표시 · 방 이름 · 레벨
 const lb=lay('labels');for(let k=0;k<N;k++){const cx=BN.l-46,cy=-(lvl(k))-30;mk('circle',{cx,cy,r:19,fill:'#fff',stroke:INK,'stroke-width':1.3,'vector-effect':'non-scaling-stroke'},lb);const tx=mk('text',{x:cx,y:cy+6,'text-anchor':'middle',style:'font:italic 700 17px Arial,sans-serif;fill:#1c1c1c'},lb);tx.textContent=fname(k)}
 const rg=lay('labels',{'pointer-events':'none',style:'font:italic 600 15px Arial,\'Noto Sans KR\',sans-serif;fill:#333'});
 for(let k=0;k<N;k++)for(const r of roomsOf(k)){const nm=S.rooms[r.key];if(!nm&&!OPT.dims)continue;const cx=(r.left+r.right)/2,ey=lvl(k)+fh(k)-sl(k+1)-34;
  if(OPT.dims){mk('path',{d:`M${r.left} ${-ey}H${r.right}M${r.left} ${-ey-6}v12M${r.right} ${-ey-6}v12`,stroke:'#333','stroke-width':1,fill:'none'},rg)}
  const tx=mk('text',{x:cx,y:-ey-8,'text-anchor':'middle'},rg);tx.textContent=(nm?nm+'  ':'')+(OPT.dims?Math.round(r.right-r.left)+'cm':'')}
 const lv=lay('levels',{'pointer-events':'none',style:'font:italic 600 15px Arial,sans-serif;fill:#1c1c1c'});
 for(let k=0;k<=N;k++){const e=lvl(k),x=BN.r+36;mk('path',{d:`M${BN.r+4} ${-e}H${x+70}M${x} ${-e}l-9 -14h18z`,stroke:INK,'stroke-width':1.2,fill:k===B?INK:'#fff'},lv);const tx=mk('text',{x:x+16,y:-e-8},lv);tx.textContent=(k===B?'±0.00':(e>0?'+':'-')+(Math.abs(e)/100).toFixed(2))+(k===N?' (상단)':' ('+fname(k)+')')}
 // 가구
 const g=lay('items',{id:'items'});
 [...S.items].sort((a,b2)=>((b2.cs==='behind')-(a.cs==='behind'))||(a.z-b2.z)).forEach(it=>renderItem(it,g,WT));   // 원경(연하게)은 가려지지 않고, 다른 가구 뒤쪽에 연한 선으로 그림
 drawSel();applyVP();inspector();caption();lwInfo();
}
function lwInfo(){const el=$('#lwInfo');if(!el)return;const W=LASTW;const n=S.items.length;el.textContent=n?`적용값 — 외곽 ${(+W._o).toFixed(2)}cm · 내부 ${(+W._i).toFixed(2)}cm (가구 ${n}개)`:`가구를 놓으면 적용값이 표시됩니다 (설정: 외곽 ${S.lw.out} · 내부 ${S.lw.inn})`}
function caption(){const el=$('#capR');if(el)el.textContent=`가구 ${S.items.length}개 · 지상 ${S.b.f-BB()}층${BB()?' · 지하 '+BB()+'층':''} · 폭 ${S.b.w}cm`}
/* ---------- 선택/객체 ---------- */
function findObj(id){if(!id)return null;let o=S.items.find(i=>i.uid===id);if(o)return {k:'item',o};o=S.parts.find(i=>i.id===id);if(o)return {k:'part',o};o=S.ops.find(i=>i.id===id);if(o)return {k:'op',o};o=S.stairs.find(i=>i.id===id);if(o)return {k:'stair',o};o=S.terr.find(i=>i.id===id);if(o)return {k:'terr',o};if(id==='wall')return {k:'wall',o:S.b};return null}
function placeHandle(cx,cy){svg.querySelectorAll('.hnd,.hnd-hit').forEach(n=>n.remove());const r=pxcm();
 mk('circle',{class:'sel hnd-hit',cx,cy,r:11*r,'data-h':'br'},svg);mk('circle',{class:'sel hnd',cx,cy,r:4.5*r,'data-h':'br'},svg)}
function drawSel(){svg.querySelectorAll('.sel,.guide').forEach(n=>n.remove());const ob=findObj(sel);if(!ob)return;
 if(ob.k==='item'){const it=ob.o,x0=it.x-it.w/2,y0=-it.e-it.h;
  mk('rect',{class:'sel sel-box',x:x0,y:y0,width:it.w,height:it.h},svg);placeHandle(x0+it.w,y0+it.h);
  const k=nearLevel(it.e);if(k.d<1)mk('line',{class:'guide',x1:it.x-it.w,y1:-it.e,x2:it.x+it.w,y2:-it.e},svg);return}
 const els=[...svg.querySelectorAll(`[data-id="${sel}"]`)];if(!els.length)return;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
 els.forEach(e=>{try{const bb=e.getBBox();x0=Math.min(x0,bb.x);y0=Math.min(y0,bb.y);x1=Math.max(x1,bb.x+bb.width);y1=Math.max(y1,bb.y+bb.height)}catch(x){}});
 if(x1>x0)mk('rect',{class:'sel sel-box',x:x0-4,y:y0-4,width:x1-x0+8,height:y1-y0+8},svg)}
/* ---------- 상태/이력 ---------- */
function commit(label){hist.push(JSON.stringify(S));if(hist.length>120)hist.shift();fut=[];persist();btns()}
function restore(js){S=norm(JSON.parse(js));if(!findObj(sel))sel=null;sync();render()}
function undo(){if(hist.length<2)return;fut.push(hist.pop());restore(hist[hist.length-1]);persist();btns()}
function redo(){if(!fut.length)return;const j=fut.pop();hist.push(j);restore(j);persist();btns()}
function btns(){$('#undo').disabled=hist.length<2;$('#redo').disabled=!fut.length}
/* ---------- 가구 ---------- */
const avail=a=>['front','leftSide','rightSide'].filter(k=>a.views[k]);
function newItem(a,x,e){const view=avail(a)[0];const v=a.views[view];const h0=(a.defaultSizeCm&&a.defaultSizeCm.height)||100;const hh=Math.min(Math.max(h0,5),600);const w=hh*(v.aspect||1);
 return {uid:uid(),assetId:a.assetId,view,x:Math.round(x),e,w:+w.toFixed(1),h:+hh.toFixed(1),flip:false,cs:'proj',z:(Math.max(0,...S.items.map(i=>i.z))+1)}}
function addAsset(id,x,y){const a=AM[id];if(!a||!avail(a).length)return;const b=S.b;
 let e=lvl(Math.min(curF,b.f-1));if(y!==undefined){const ee=-y;const n=nearLevel(ee);e=n.d<40?lvl(n.k):Math.max(lvl(0),Math.round(ee))}
 const xx=x===undefined?Math.min(Math.max(b.w/2,b.t+30),b.w-b.t-30):x;const it=newItem(a,xx,e);S.items.push(it);sel=it.uid;commit();render()}
const cur=()=>S.items.find(i=>i.uid===sel);
function dup(){const ob=findObj(sel);if(!ob)return;const o=ob.o;
 if(ob.k==='item'){const c={...clone(o),uid:uid(),x:o.x+40,z:Math.max(...S.items.map(i=>i.z))+1};S.items.push(c);sel=c.uid}
 else if(ob.k==='part'){const c={...clone(o),id:uid(),x:clamp(o.x+60,XL(o.f)+S.b.t+20,XR(o.f)-S.b.t-20)};S.parts.push(c);sel=c.id}
 else if(ob.k==='op'){const c={...clone(o),id:uid()};if(o.on==='back')c.x=clamp(o.x+o.w+30,bounds().l+20,bounds().r-20);else if(o.f+1<S.b.f)c.f=o.f+1;S.ops.push(c);sel=c.id}
 else if(ob.k==='stair'){const c={...clone(o),id:uid(),x:o.x+40};S.stairs.push(c);sel=c.id}
 else if(ob.k==='terr'){const c={...clone(o),id:uid(),x0:o.x0+60,x1:o.x1+60};S.terr.push(c);sel=c.id}
 else return;commit();sync();render()}
function del(){const ob=findObj(sel);if(!ob||ob.k==='wall')return;
 if(ob.k==='item')S.items=S.items.filter(i=>i.uid!==sel);
 else if(ob.k==='part'){S.parts=S.parts.filter(i=>i.id!==sel);S.ops=S.ops.filter(o=>o.on!==sel)}
 else if(ob.k==='op')S.ops=S.ops.filter(i=>i.id!==sel);else if(ob.k==='stair')S.stairs=S.stairs.filter(i=>i.id!==sel);else if(ob.k==='terr')S.terr=S.terr.filter(i=>i.id!==sel);
 sel=null;commit();sync();render()}
function setView(v){const it=cur(),a=it&&AM[it.assetId];if(!a)return;if(v==='side'){if(it.view!=='front')return;v=a.views.rightSide?'rightSide':'leftSide'}if(!a.views[v])return;const asp=a.views[v].aspect||1;it.view=v;it.w=+(it.h*asp).toFixed(1);commit();render()}
/* ---------- 인스펙터 ---------- */
const fld=(lab,id,val,min,step)=>`<label>${lab}<input type="number" id="${id}" value="${val}" ${min!==undefined?`min="${min}"`:''} step="${step||1}"></label>`;
const opt=(lab,id,opts,val)=>`<label>${lab}<select id="${id}">${opts.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(val)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
const floorOpts=()=>Array.from({length:S.b.f},(_,k)=>[k,fnameKo(k)]);
const RAIL_TYPES=[['iron','철제 난간'],['vict','빅토리안 대리석 난간'],['brick','벽돌 난간']];
const terrFloorOpts=()=>[...Array.from({length:S.b.f},(_,k)=>[k,fnameKo(k)+' 바닥']),[S.b.f,'옥상 (최상층 위)']];
const STAIR_TYPES=[['straight','직선'],['L','ㄱ자'],['U','U자'],['spiral','그랜드 나선형'],['glass','유리 난간 (U자형)'],['outer','건물 밖 계단 (현관·테라스)']];
const stairFloorOpts=()=>Array.from({length:Math.max(1,S.b.f-1)},(_,k)=>[k,fnameKo(k)+' → '+fnameKo(k+1)]);
const onOpts=f=>[['L','왼쪽 외벽'],['R','오른쪽 외벽'],...S.parts.filter(p=>p.f===f).map(p=>[p.id,`내벽 x ${p.x}`]),['back','뒷벽(입면)']];
const bind=(id,fn)=>{const e=$(id);if(e)e.onchange=ev=>{fn(ev.target.type==='number'?(+ev.target.value):ev.target.value,ev);commit();sync();render()}};
const stdBtns=`<div class="btns"><button id="idup">복제</button><button id="idel">삭제</button></div>`;
function inspector(){const ob=findObj(sel),body=$('#inspBody'),H=$('#insp h4');
 if(!ob){H.textContent='선택한 객체';body.className='hint';body.innerHTML='가구·벽·문·창문·계단을 클릭하거나 왼쪽에서 추가하세요.<br><br>Delete 삭제 · Ctrl+D 복제 · 방향키 이동 · Alt 누르면 바닥 자동 붙임 해제 · 휠 확대/축소 · 빈 곳 드래그 이동';return}
 body.className='';const o=ob.o;
 if(ob.k==='item')return inspItem(o,body,H);
 if(ob.k==='part'){H.textContent='내벽';body.innerHTML=`${opt('층','pf',floorOpts(),o.f)}${fld('위치 x(cm)','px',o.x,0,5)}${fld('두께(cm)','pt',o.t,4,1)}${opt('재질','pm',MATS,o.mat)}${stdBtns}<div class="hint" style="margin-top:6px">도면에서 좌우로 끌어 옮길 수 있어요.</div>`;
  bind('#pf',v=>o.f=+v);bind('#px',v=>o.x=clamp(v,XL(o.f)+S.b.t+o.t,XR(o.f)-S.b.t-o.t));bind('#pt',v=>o.t=clamp(v,4,60));bind('#pm',v=>o.mat=v)}
 else if(ob.k==='op'){H.textContent=o.kind==='door'?'문':'창문';const back=o.on==='back';
  body.innerHTML=`${opt('종류','ok',[['door','문'],['window','창문']],o.kind)}${opt('층','of',floorOpts(),o.f)}${opt('붙는 곳','oo',onOpts(o.f),o.on)}${back?fld('중심 x(cm)','ox',o.x,0,5)+fld('폭(cm)','ow',o.w,20,5):''}${fld('바닥에서 높이(cm)','os',o.sill,0,5)}${fld('개구부 높이(cm)','oh',o.h,20,5)}${stdBtns}<div class="hint" style="margin-top:6px">${back?'뒷벽 개구부는 입면으로 보이는 문·창문이에요.':'벽에 뚫린 단면 개구부예요 (벽 두께만큼).'} 도면에서 위아래로 끌 수 있어요.</div>`;
  bind('#ok',v=>o.kind=v);bind('#of',v=>{o.f=+v;if(o.on!=='back'&&o.on!=='L'&&o.on!=='R')o.on='back'});bind('#oo',v=>o.on=v);bind('#ox',v=>o.x=clamp(v,bounds().l,bounds().r));bind('#ow',v=>o.w=Math.max(20,v));bind('#os',v=>o.sill=clamp(v,0,fh(o.f)-s_(o.f)-20));bind('#oh',v=>o.h=clamp(v,20,fh(o.f)-s_(o.f)-o.sill))}
 else if(ob.k==='stair'&&o.type==='outer'){H.textContent='건물 밖 계단';
  body.innerHTML=`${opt('도착 층 (문·테라스가 있는 층)','of',floorOpts(),o.f)}${opt('출발','ofrom',[[-1,'지면'],...floorOpts().filter(([k])=>k!==o.f).map(([k,t])=>[k,t+' 바닥'])],o.from>=0?o.from:-1)}${opt('붙는 쪽','oside',[['R','오른쪽 바깥'],['L','왼쪽 바깥']],o.side||'R')}${fld('수평 길이(cm, 0=자동)','orun',o.run||0,0,10)}${fld('단 수(0=자동)','on_',o.n||0,0,1)}${opt('재질','omat',MATS,o.mat||'concrete')}${stdBtns}<div class="hint" style="margin-top:6px">외벽 바깥쪽에 붙어 지면(또는 다른 층)과 문턱을 이어요. 지면보다 낮은 지하 현관이면 아래로 내려가는 계단이 돼요. 1층 바닥이 지면보다 높아야 현관 계단이 생겨요(건물 탭의 '1층 바닥 높이').</div>`;
  bind('#of',v=>o.f=+v);bind('#ofrom',v=>o.from=+v);bind('#oside',v=>o.side=v);bind('#orun',v=>o.run=v>=60?v:0);bind('#on_',v=>o.n=v>=3?Math.min(60,Math.round(v)):0);bind('#omat',v=>o.mat=v)}
 else if(ob.k==='terr'){H.textContent='테라스';
  body.innerHTML=`${opt('바닥 높이(층)','tf',terrFloorOpts(),o.f)}${fld('왼쪽 끝 x(cm)','tx0',o.x0,undefined,5)}${fld('오른쪽 끝 x(cm)','tx1',o.x1,undefined,5)}${opt('난간','tr',RAIL_TYPES,o.rail)}${opt('구성','ts',[['1','바닥 + 난간'],['0','난간만 (이미 바닥이 있는 곳)']],o.slab===false?'0':'1')}${stdBtns}<div class="hint" style="margin-top:6px">도면에서 좌우로 끌어 옮길 수 있어요. 난간은 왼쪽·오른쪽 끝 사이 전체에 그려져요.</div>`;
  bind('#tf',v=>o.f=clamp(+v,0,S.b.f));bind('#tx0',v=>o.x0=Math.min(v,o.x1-20));bind('#tx1',v=>o.x1=Math.max(v,o.x0+20));bind('#tr',v=>o.rail=v);bind('#ts',v=>o.slab=v==='1')}
 else if(ob.k==='stair'){H.textContent='계단';const as=!!STAIR_ASSET[o.type];
  body.innerHTML=`${opt('모양','st',STAIR_TYPES,o.type)}${opt('시작 층','sf',stairFloorOpts(),o.f)}${fld(as?'왼쪽 끝 x(cm)':'시작 x(cm)','sx',o.x,0,5)}${as?fld('폭(cm, 0=자동)','sw',o.w||0,0,10):fld('수평 길이(cm)','sr',o.run,60,10)}${opt(as?'방향(그림 반전)':'오르는 방향','sd',[[1,'오른쪽 →'],[-1,'← 왼쪽']],o.dir)}${as?opt('그림 면','sv',[['auto',o.type==='glass'?'옆면 (방향 따라)':'앞면'],['front','앞면(정면)'],['back','뒷면 (정면 그림 반대로)']],o.sv||'auto'):''}${as?'':fld(o.type==='straight'?'단 수 (0=자동)':'한 구간 단 수 (0=자동)','sn',o.n||0,0,1)+(o.type!=='straight'?fld('참(랜딩) 깊이(cm)','sl',o.land||100,60,10):'')+opt('재질','sm',MATS,o.mat||'concrete')}${stdBtns}<div class="hint" style="margin-top:6px">${as?'에셋 그림을 층고에 맞춰 늘려 쓰는 계단이에요. 폭을 바꾸면 그림 비율이 달라질 수 있어요.':'위층 바닥과 자동으로 이어져요.'} 계단은 바닥 뒤에 그려져 바닥이 끊기지 않습니다.</div>`;
  bind('#st',v=>o.type=v);bind('#sf',v=>o.f=+v);bind('#sx',v=>o.x=v);bind('#sr',v=>o.run=Math.max(60,v));bind('#sw',v=>o.w=v>=40?v:0);bind('#sd',v=>o.dir=+v);bind('#sv',v=>o.sv=v);bind('#sl',v=>o.land=Math.max(60,v));bind('#sn',v=>o.n=v>=3?Math.min(40,Math.round(v)):0);bind('#sm',v=>o.mat=v)}
 else if(ob.k==='wall'){H.textContent='외벽 · 슬래브';body.innerHTML=`${fld('외벽 두께(cm)','wt',S.b.t,10,5)}${fld('슬래브 두께(cm)','wsl',S.b.s,10,5)}${opt('벽 재질','wm',MATS,S.b.mat.wall)}${opt('슬래브 재질','wsm',MATS,S.b.mat.slab)}<div class="hint" style="margin-top:6px">절단된 벽과 슬래브는 굵은 절단선으로 그려집니다.</div>`;
  bind('#wt',v=>S.b.t=clamp(v,10,60));bind('#wsl',v=>{S.b.s=clamp(v,10,60);S.b.sk=Array.from({length:S.b.f+1},()=>S.b.s)});bind('#wm',v=>S.b.mat.wall=v);bind('#wsm',v=>S.b.mat.slab=v)}
 $('#idup')&&($('#idup').onclick=dup);$('#idel')&&($('#idel').onclick=del)}
const s_=f=>sl(f+1);
function inspItem(it,body,H){H.textContent='선택한 가구';
 const a=AM[it.assetId]||{views:{},nameKo:'(없음)'};const V={front:'정면',leftSide:'좌측',rightSide:'우측'};
 const warns=(a.reviewReasons||[]).filter(r=>/multi-item|stray|size-out|mismatch|extreme|empty|too-few/.test(r)).map(r=>r.replace(/^[a-zA-Z]+:/,''));
 const w=LASTW[it.uid];
 body.innerHTML=`<b>${esc(a.nameKo)}</b><div class="hint">${esc(a.assetId)}</div><div class="seg" style="margin:8px 0"><button data-v="front" class="${it.view==='front'?'on':''}" ${a.views.front?'':'disabled'}>front</button><button data-v="side" class="${it.view!=='front'?'on':''}" ${(a.views.rightSide||a.views.leftSide)?'':'disabled'}>side</button></div>
 <label>폭(cm)<input type="number" id="iw" value="${it.w}" step="1" min="5"></label><label>높이(cm)<input type="number" id="ih" value="${it.h}" step="1" min="5"></label>
 <label>x 위치(cm)<input type="number" id="ix" value="${Math.round(it.x)}" step="5"></label><label>바닥 높이(cm)<input type="number" id="ie" value="${Math.round(it.e)}" step="5"></label>
 ${opt('단면 상태','ics',[['proj','투영 (절단 안 됨)'],['cut','절단됨 (굵은 선)'],['behind','원경 (연하게)']],it.cs||'proj')}
 <div class="btns"><button id="iflip">좌우 반전</button><button id="idup">복제</button><button id="idel">삭제</button><button id="ifwd">앞으로</button><button id="ibk">뒤로</button><button id="irs">기본 크기</button></div>
 ${w?`<div class="hint" style="margin-top:6px">이 가구 선: 외곽 ${w.wo.toFixed(2)}cm · 내부 ${w.wi.toFixed(2)}cm</div>`:''}
 ${warns.length?`<div class="warn">⚠ 원본 도면 검수 메모: ${esc(warns.join(', '))}</div>`:''}<div class="hint" style="margin-top:6px">폭·높이는 비율 고정입니다. 방향은 '좌우 반전'으로 바꿔요. '원경 (연하게)'는 멀리 있어서 선이 연하게 보이는 가구예요(원근 표현). 벽 뒤로 숨는 것이 아니라 선만 연해져요.</div>`;
 body.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>setView(b.dataset.v));
 const asp=()=>it.w/it.h;
 $('#iw').onchange=e=>{const v=Math.max(5,+e.target.value||it.w);const r=asp();it.w=v;it.h=+(v/r).toFixed(1);commit();render()};
 $('#ih').onchange=e=>{const v=Math.max(5,+e.target.value||it.h);const r=asp();it.h=v;it.w=+(v*r).toFixed(1);commit();render()};
 $('#ix').onchange=e=>{it.x=+e.target.value||0;commit();render()};$('#ie').onchange=e=>{it.e=Math.max(lvl(0),+e.target.value||0);commit();render()};
 $('#ics').onchange=e=>{it.cs=e.target.value;commit();render()};
 $('#iflip').onclick=()=>{it.flip=!it.flip;commit();render()};$('#idup').onclick=dup;$('#idel').onclick=del;
 $('#ifwd').onclick=()=>{it.z=Math.max(...S.items.map(i=>i.z))+1;commit();render()};$('#ibk').onclick=()=>{it.z=Math.min(...S.items.map(i=>i.z))-1;commit();render()};
 $('#irs').onclick=()=>{const v=a.views[it.view],h0=Math.min(Math.max((a.defaultSizeCm&&a.defaultSizeCm.height)||100,5),600);it.h=h0;it.w=+(h0*(v.aspect||1)).toFixed(1);commit();render()}}
/* ---------- 포인터 ---------- */
let drag=null,tool=null;
const pxcm=()=>VP.w/(svg.getBoundingClientRect().width||800); // 화면 1px = 몇 cm
const busy=on=>svg.classList.toggle('drag',on); // 움직이는 동안 무거운 손그림 필터를 잠시 끔
let busyT=0;
function floorAt(y){const e=-y;for(let k=S.b.f-1;k>=0;k--)if(e>=lvl(k)&&e<lvl(k+1))return k;return -1}
function snapMove(it,x,e,alt){const r=pxcm(),thr=Math.max(3,8*r);let gx=null,gy=null;
 if(alt)return {x:Math.round(x),e:Math.round(e),gx,gy};
 const fk=nearLevel(it.e).k,xs=[XL(fk)+S.b.t,XR(fk)-S.b.t];S.parts.forEach(p=>xs.push(p.x-p.t/2,p.x+p.t/2));S.items.forEach(o=>{if(o.uid!==it.uid)xs.push(o.x-o.w/2,o.x,o.x+o.w/2)});
 let bd=thr+1,dx=0;for(const c of xs)for(const off of [-it.w/2,0,it.w/2]){const d=c-(x+off);if(Math.abs(d)<bd){bd=Math.abs(d);dx=d;gx=c}}
 if(bd<=thr)x+=dx;else{gx=null;x=Math.round(x)}
 const ys=[];for(let k=0;k<S.b.f;k++){ys.push([lvl(k),0]);ys.push([lvl(k+1)-sl(k+1),it.h])}S.items.forEach(o=>{if(o.uid!==it.uid){ys.push([o.e+o.h,0],[o.e,it.h])}});
 let bd2=thr+1,dy=0;for(const [c,off] of ys){const d=c-(e+off);if(Math.abs(d)<bd2){bd2=Math.abs(d);dy=d;gy=c}}
 if(bd2<=thr)e+=dy;else{gy=null;e=Math.round(e)}
 return {x,e,gx,gy}}
function guides(gx,gy){const E=EH(),W=bounds().r;if(gx!==null)mk('line',{class:'guide',x1:gx,y1:-(E+120),x2:gx,y2:-lvl(0)+80},svg);if(gy!==null)mk('line',{class:'guide',x1:bounds().l-100,y1:-gy,x2:W+100,y2:-gy},svg)}
function setTool(n){tool=n;svg.style.cursor=n?'crosshair':'';const b=$('#pDraw');if(b)b.classList.toggle('on',!!n);svg.querySelectorAll('.guide').forEach(g=>g.remove());if(n)msg('벽을 넣을 층 안쪽을 클릭하세요 (Esc 취소)')}
function wallPos(p){const k=floorAt(p.y);if(k<0)return null;const x=Math.round(p.x/5)*5;if(!(x>XL(k)+S.b.t+20&&x<XR(k)-S.b.t-20))return {k,x:null};return {k,x}}
function placeWall(p){const w=wallPos(p);if(!w){msg('층 안쪽을 눌러 주세요');return}if(w.x===null){msg('벽은 외벽 안쪽에 놓을 수 있어요');return}
 const q={id:uid(),f:w.k,x:w.x,t:12,mat:S.b.mat.wall};S.parts.push(q);sel=q.id;setTool(null);commit();sync();render()}
svg.addEventListener('pointerdown',ev=>{if(ev.button>1)return;const p=toWorld(ev);
 if(tool==='wall'){placeWall(p);return}
 const hnd=ev.target.closest('[data-h]');const g=ev.target.closest('.itm');const og=ev.target.closest('[data-id]');svg.setPointerCapture(ev.pointerId);const pxs=pxcm();
 const startMv=it=>{sel=it.uid;drag={m:'mv',it,dx:p.x-it.x,dy:p.y-(-it.e),p0:p,x0:it.x,e0:it.e,sx:ev.clientX,sy:ev.clientY,moved:false};busy(true);drawSel();inspector()};
 if(hnd){const it=cur();if(!it)return;drag={m:'rs',it,s:{w:it.w,h:it.h},off:p.x-(it.x+it.w/2)};busy(true);return}
 if(g){startMv(S.items.find(i=>i.uid===g.dataset.uid));return}
 if(og){sel=og.dataset.id;const ob=findObj(sel);drag={m:'og',ob,p0:p,s:clone(ob.o),moved:false};busy(true);drawSel();inspector();return}
 const si=cur();if(si&&p.x>=si.x-si.w/2&&p.x<=si.x+si.w/2&&-p.y>=si.e&&-p.y<=si.e+si.h){startMv(si);return} // 선택한 가구는 상자 안 어디를 잡아도 옮겨짐
 sel=null;drawSel();inspector();drag={m:'pan',sx:ev.clientX,sy:ev.clientY,vx:VP.x,vy:VP.y};busy(true)});
let pmEv=null,pmRaf=0;
svg.addEventListener('pointermove',ev=>{pmEv=ev;if(pmRaf)return;pmRaf=requestAnimationFrame(()=>{pmRaf=0;handleMove(pmEv)})});
function handleMove(ev){const p=toWorld(ev);
 if(!drag){if(tool==='wall'){svg.querySelectorAll('.guide').forEach(g=>g.remove());const w=wallPos(p);if(w&&w.x!==null)mk('line',{class:'guide',x1:w.x,y1:-lvl(w.k),x2:w.x,y2:-(lvl(w.k+1)-sl(w.k+1))},svg)}return}
 if(drag.m==='mv'){const it=drag.it,r=pxcm();if(!drag.moved&&Math.hypot(ev.clientX-drag.sx,ev.clientY-drag.sy)<3)return;drag.moved=true;
  let x=p.x-drag.dx,e=-(p.y-drag.dy);if(ev.shiftKey){if(Math.abs(p.x-drag.p0.x)>Math.abs(p.y-drag.p0.y))e=drag.e0;else x=drag.x0}
  const q=snapMove(it,x,e,ev.altKey);it.x=q.x;it.e=Math.max(lvl(0),q.e);
  const gg=svg.querySelector(`.itm[data-uid="${it.uid}"]`);if(gg)gg.setAttribute('transform',`translate(${it.x-it.w/2} ${-it.e-it.h})`+(it.flip?` translate(${it.w} 0) scale(-1 1)`:''));drawSel();guides(q.gx,q.gy)}
 else if(drag.m==='og'){const {k,o}=drag.ob,s0=drag.s,dx=p.x-drag.p0.x,dy=p.y-drag.p0.y;if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<3*pxcm())return;drag.moved=true;const sn=v=>Math.round(v/5)*5;
  if(k==='part')o.x=clamp(sn(s0.x+dx),XL(o.f)+S.b.t+o.t,XR(o.f)-S.b.t-o.t);
  else if(k==='stair')o.x=sn(s0.x+dx);
  else if(k==='terr'){const w=s0.x1-s0.x0;o.x0=sn(s0.x0+dx);o.x1=o.x0+w}
  else if(k==='op'){o.sill=clamp(sn(s0.sill-dy),0,fh(o.f)-s_(o.f)-o.h);if(o.on==='back')o.x=clamp(sn(s0.x+dx),bounds().l,bounds().r)}
  render()}
 else if(drag.m==='rs'){const it=drag.it;const w=Math.max(5,2*(p.x-drag.off-it.x));const r=drag.s.w/drag.s.h;it.w=+w.toFixed(1);it.h=+(w/r).toFixed(1);render()}
 else if(drag.m==='pan'){const r=svg.getBoundingClientRect(),k=VP.w/r.width;VP.x=drag.vx-(ev.clientX-drag.sx)*k;VP.y=drag.vy-(ev.clientY-drag.sy)*k;applyVP()}}
const endDrag=()=>{if(!drag)return;const d=drag;drag=null;busy(false);svg.querySelectorAll('.guide').forEach(g=>g.remove());if((d.m==='mv'||d.m==='og')&&d.moved){commit();if(d.m==='og')sync();inspector()}else if(d.m==='rs'){commit()}};
svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);
svg.addEventListener('wheel',ev=>{ev.preventDefault();busy(true);clearTimeout(busyT);busyT=setTimeout(()=>{if(!drag)busy(false)},160);const p=toWorld(ev);const f=ev.deltaY>0?1.12:1/1.12;const nw=Math.min(8000,Math.max(150,VP.w*f));const k=nw/VP.w;VP.x=p.x-(p.x-VP.x)*k;VP.y=p.y-(p.y-VP.y)*k;VP.w=nw;applyVP()},{passive:false});
svg.addEventListener('dragover',e=>e.preventDefault());svg.addEventListener('drop',e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(!id.startsWith('asset:'))return;const p=toWorld(e);addAsset(id.slice(6),p.x,p.y)});
window.addEventListener('resize',applyVP);
addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;const ob=findObj(sel);
 if(e.key==='Escape'&&tool){setTool(null);return}
 if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();redo()}
 else if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();dup()}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();del()}
 else if(ob&&e.key.startsWith('Arrow')){e.preventDefault();const st=e.shiftKey?20:5,o=ob.o;
  if(ob.k==='item'){if(e.key==='ArrowLeft')o.x-=st;if(e.key==='ArrowRight')o.x+=st;if(e.key==='ArrowUp')o.e+=st;if(e.key==='ArrowDown')o.e=Math.max(lvl(0),o.e-st)}
  else if(ob.k==='terr'){if(e.key==='ArrowLeft'){o.x0-=st;o.x1-=st}if(e.key==='ArrowRight'){o.x0+=st;o.x1+=st}}
  else if(ob.k==='part'||ob.k==='stair'){if(e.key==='ArrowLeft')o.x-=st;if(e.key==='ArrowRight')o.x+=st;if(ob.k==='part')o.x=clamp(o.x,XL(o.f)+S.b.t+o.t,XR(o.f)-S.b.t-o.t)}
  else if(ob.k==='op'){if(e.key==='ArrowUp')o.sill=clamp(o.sill+st,0,fh(o.f)-s_(o.f)-o.h);if(e.key==='ArrowDown')o.sill=Math.max(0,o.sill-st);if(o.on==='back'){if(e.key==='ArrowLeft')o.x-=st;if(e.key==='ArrowRight')o.x+=st}}
  commit();sync();render()}
 else if(ob&&ob.k==='item'&&e.key===']'){ob.o.z=Math.max(...S.items.map(i=>i.z))+1;commit();render()}else if(ob&&ob.k==='item'&&e.key==='['){ob.o.z=Math.min(...S.items.map(i=>i.z))-1;commit();render()}else if(e.key==='Escape'){sel=null;render()}});
/* ---------- 방 ---------- */
function roomsOf(f){const b=S.b;const ps=S.parts.filter(p=>p.f===f).sort((a,c)=>a.x-c.x);const lefts=[{id:'L',x:XL(f)+b.t},...ps.map(p=>({id:p.id,x:p.x+p.t/2}))];
 return lefts.map((l,i)=>({key:f+':'+l.id,left:l.x,right:i<ps.length?ps[i].x-ps[i].t/2:XR(f)-b.t,rightPart:i<ps.length?ps[i]:null}))}
function defaultWallX(f){const rs=roomsOf(f);let best=rs[0];for(const r of rs)if(r.right-r.left>best.right-best.left)best=r;return Math.round((best.left+best.right)/2/5)*5}
/* ---------- 건물 설정 ---------- */
function sync(){const b=S.b,B=BB();$('#bw').value=b.w;$('#bf').value=b.f-B;$('#bb').value=B;$('#bh').value=b.h;$('#bs').value=b.s;$('#bt').value=b.t;$('#br').value=b.roof;$('#brh').value=b.rh;
 const opts=floorOpts().map(([k,t])=>`<option value="${k}">${t}</option>`).join('');$('#curFloor').innerHTML=opts;curF=Math.min(Math.max(curF,0),b.f-1);$('#curFloor').value=curF;
 const pf=$('#pFloor').value,of=$('#oFloor').value;for(const id of ['#pFloor','#oFloor'])$(id).innerHTML=opts;$('#pFloor').value=pf!==''&&+pf<b.f?pf:B;$('#oFloor').value=of!==''&&+of<b.f?of:B;
 {const fo=floorOpts().map(([k,t])=>`<option value="${k}">${t}</option>`).join('');const to=terrFloorOpts().map(([k,t])=>`<option value="${k}">${t}</option>`).join('');
  const keep=id=>{const v=$(id).value;return v};const set=(id,html,def)=>{const v=keep(id);$(id).innerHTML=html;$(id).value=(v!==''&&$(id).querySelector(`option[value="${v}"]`))?v:def};
  set('#wxFloor',fo,B);set('#raFloor',fo,B);set('#tfFloor',to,Math.min(B+1,b.f));set('#oxFloor',fo,B);
  const f0=+$('#wxFloor').value;$('#wxInfo').textContent=`현재 ${Math.round(XR(f0)-XL(f0))}cm (x ${Math.round(XL(f0))} ~ ${Math.round(XR(f0))})`;if(document.activeElement!==$('#wxW'))$('#wxW').value=Math.round(XR(f0)-XL(f0));$('#brz').value=b.rz||0;
  $('#tList').innerHTML=S.terr.length?S.terr.map(q=>`<div class="li ${sel===q.id?'on':''}" data-pick="${q.id}"><span>${(RAIL_TYPES.find(r=>r[0]===q.rail)||[0,''])[1]} · ${q.f<b.f?fnameKo(q.f)+' 바닥':'옥상'} · x ${Math.round(q.x0)}~${Math.round(q.x1)}</span><button data-rm="${q.id}">삭제</button></div>`).join(''):'<div class="hint">테라스 없음</div>'}
 $('#sFloor').innerHTML=stairFloorOpts().map(([k,t])=>`<option value="${k}">${t}</option>`).join('');
 const oo=$('#oOn'),pf2=+$('#oFloor').value||0;oo.innerHTML=onOpts(pf2).map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');
 $('#fhList').innerHTML=b.hs.map((h,k)=>`<label class="sub">${fnameKo(k)} 층고 / 위 슬래브(cm)<span class="two"><input type="number" data-fh="${k}" value="${h}" min="220" max="500" step="5"><input type="number" data-sk="${k+1}" value="${sl(k+1)}" min="10" max="60" step="5"></span></label>`).join('');
 $('#fhList').querySelectorAll('[data-fh]').forEach(i=>i.onchange=e=>{b.hs[+i.dataset.fh]=clamp(+e.target.value||b.h,220,500);reflow();commit();sync();render();fit()});
 $('#fhList').querySelectorAll('[data-sk]').forEach(i=>i.onchange=e=>{b.sk[+i.dataset.sk]=clamp(+e.target.value||b.s,10,60);commit();sync();render()});
 let h='';for(let k=b.f-1;k>=0;k--){h+=`<div class="rmh">${fnameKo(k)}</div>`;roomsOf(k).forEach((r,i)=>{h+=`<div class="rm"><input data-rn="${esc(r.key)}" value="${esc(S.rooms[r.key]||'')}" placeholder="방 ${i+1} 이름"><input type="number" data-rw="${esc(r.key)}" value="${Math.round(r.right-r.left)}" step="10" min="60" ${r.rightPart?'':'disabled title="오른쪽이 외벽이라 폭은 건물 폭으로 정해져요"'}><span class="u">cm</span></div>`})}
 $('#rmList').innerHTML=h;
 $('#rmList').querySelectorAll('[data-rn]').forEach(i=>i.onchange=e=>{S.rooms[i.dataset.rn]=e.target.value;commit();render()});
 $('#rmList').querySelectorAll('[data-rw]').forEach(i=>i.onchange=e=>{const key=i.dataset.rw;const [f]=key.split(':');const r=roomsOf(+f).find(q=>q.key===key);if(!r||!r.rightPart)return;
  const ps=S.parts.filter(p=>p.f===+f).sort((a,c)=>a.x-c.x);const idx=ps.indexOf(r.rightPart);const nextL=idx+1<ps.length?ps[idx+1].x-ps[idx+1].t/2-60:XR(+f)-b.t-60;
  r.rightPart.x=Math.round(clamp(r.left+(+e.target.value||60)+r.rightPart.t/2,r.left+60+r.rightPart.t/2,nextL));commit();sync();render()});
 const L=S.lw;$('#lwOut').value=L.out;$('#lwInn').value=L.inn;$('#lwCut').value=L.cut;$('#lwAuto').checked=!!L.auto;$('#hsc').value=b.hsc;$('#hang').value=b.hang;$('#hw').value=b.hw;$('#bOp').value=L.bOp;$('#bDash').checked=!!L.bDash;$('#optVoid').checked=!!b.void;
 $('#layList').innerHTML=LAYERS.map(([k,t])=>`<label class="chk"><input type="checkbox" data-ly="${k}" ${S.layers[k]?'checked':''}> ${t}</label>`).join('');
 $('#wpList').innerHTML=`<label>모든 층<select data-wpall><option value="">고르면 전체 적용</option>${WP.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`+b.wp.map((w,k)=>({k,w})).reverse().map(({k,w})=>`<label>${fnameKo(k)}<select data-wp="${k}">${WP.map(([v,t])=>`<option value="${v}" ${v===w?'selected':''}>${t}</option>`).join('')}</select></label>`).join('');
 for(const [id,key] of [['#mWall','wall'],['#mSlab','slab'],['#mRoof','roof']]){const sel_=$(id);sel_.innerHTML=MATS.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');if(key==='roof')sel_.insertAdjacentHTML('afterbegin','<option value="roof">지붕 사선</option>');sel_.value=b.mat[key]}
 const lst=(arr,fn)=>arr.length?arr.map(fn).join(''):'<div class="hint">없음</div>';
 $('#oList').innerHTML=lst(S.ops,o=>`<div class="li ${sel===o.id?'on':''}" data-pick="${o.id}"><span>${o.kind==='door'?'문':'창'} · ${fnameKo(o.f)} · ${({L:'왼쪽 외벽',R:'오른쪽 외벽',back:'뒷벽'})[o.on]||'내벽'}</span><button data-rm="${o.id}">삭제</button></div>`);
 $('#sList').innerHTML=lst(S.stairs,a=>`<div class="li ${sel===a.id?'on':''}" data-pick="${a.id}"><span>${(STAIR_TYPES.find(q=>q[0]===a.type)||[0,a.type])[1]} · ${a.type==='outer'?(a.from>=0?fnameKo(a.from):'지면')+'→'+fnameKo(a.f)+' ('+(a.side==='L'?'왼쪽':'오른쪽')+' 바깥)':fnameKo(a.f)+'→'+fnameKo(a.f+1)}</span><button data-rm="${a.id}">삭제</button></div>`);
 $('#pList').innerHTML=S.parts.length?S.parts.map(p=>`<div class="li ${sel===p.id?'on':''}" data-pick="${p.id}"><span>${fnameKo(p.f)} · x ${p.x}cm</span><button data-rm="${p.id}">삭제</button></div>`).join(''):'<div class="hint">내벽 없음</div>';
 document.querySelectorAll('#tHouse [data-pick]').forEach(d=>d.onclick=e=>{if(e.target.closest('[data-rm]'))return;sel=d.dataset.pick;drawSel();inspector();sync()});
 document.querySelectorAll('#tHouse [data-rm]').forEach(bt=>bt.onclick=()=>{sel=bt.dataset.rm;del()})}
function reflow(){const b=S.b;S.items.forEach(i=>{const m=lvl(b.f);if(i.e>m)i.e=m;if(i.e<lvl(0))i.e=lvl(0)})}
/* 지상/지하 층수 바꾸기: 층 번호가 바뀌어도 벽·문·계단·방 이름이 제 층에 붙어 있도록 같이 옮김 */
function setFloors(above,below){const b=S.b;above=clamp(Math.round(above)||1,1,6);below=clamp(Math.round(below)||0,0,3);const d=below-b.bb;
 if(d>0){b.ext.unshift(...Array.from({length:d},()=>({l:0,r:b.w})));b.hs.unshift(...Array(d).fill(b.h));b.sk.unshift(...Array(d).fill(b.s));b.wp.unshift(...Array(d).fill('plain'))}else if(d<0){b.ext.splice(0,-d);b.hs.splice(0,-d);b.sk.splice(0,-d);b.wp.splice(0,-d)}
 S.terr=S.terr.filter(o=>o.f+d>=0);S.terr.forEach(o=>o.f+=d);S.parts=S.parts.filter(o=>o.f+d>=0);S.ops=S.ops.filter(o=>o.f+d>=0);S.stairs=S.stairs.filter(o=>o.f+d>=0);[...S.parts,...S.ops,...S.stairs].forEach(o=>o.f+=d);
 const nr={};for(const k in S.rooms){const [f,id]=k.split(':');if(+f+d>=0)nr[(+f+d)+':'+id]=S.rooms[k]}S.rooms=nr;b.bb=below;
 const F=above+below;while(b.hs.length<F){b.hs.push(b.h);b.wp.push('plain');const top=b.ext[b.ext.length-1]||{l:0,r:b.w};b.ext.push({l:top.l,r:top.r})}b.ext.length=F;b.hs.length=F;b.wp.length=F;b.sk=Array.from({length:F+1},(_,k)=>b.sk[k]||b.s);b.f=F;
 S.parts=S.parts.filter(p=>p.f<F);S.ops=S.ops.filter(o=>o.f<F);S.stairs=S.stairs.filter(a=>a.type==='outer'?a.f<F:a.f<F-1);S.terr=S.terr.filter(o=>o.f<=F);reflow();curF=below}
const num=(id,key,min,max)=>$(id).addEventListener('change',e=>{let v=+e.target.value;v=clamp(isNaN(v)?S.b[key]:v,min,max);const ow0=S.b[key];S.b[key]=v;
 if(key==='h')S.b.hs=Array.from({length:S.b.f},()=>v);
 if(key==='s')S.b.sk=Array.from({length:S.b.f+1},()=>v);
 if(key==='w'){const ow=ow0;S.b.ext.forEach(e=>{if(e.l===0&&e.r===ow)e.r=v}); // 기본 폭을 따르던 층만 같이 바뀜(층별로 따로 고친 층은 그대로)
  S.items.forEach(i=>{i.x=Math.min(Math.max(i.x,bounds().l),bounds().r)});S.parts=S.parts.filter(p=>p.x>XL(p.f)&&p.x<XR(p.f));S.ops.forEach(o=>{if(o.on==='back')o.x=Math.min(o.x,bounds().r-20)})}
 reflow();commit();sync();render();fit()});
num('#bw','w',300,3000);num('#brz','rz',0,150);num('#bh','h',220,500);num('#bs','s',10,60);num('#bt','t',10,60);num('#brh','rh',30,400);
$('#bf').onchange=e=>{setFloors(+e.target.value,BB());commit();sync();render();fit()};
$('#bb').onchange=e=>{setFloors(S.b.f-BB(),+e.target.value);commit();sync();render();fit()};
$('#br').onchange=e=>{S.b.roof=e.target.value;commit();render()};
$('#pAdd').onclick=()=>{const f=+$('#pFloor').value;let x=$('#pX').value.trim()===''?defaultWallX(f):+$('#pX').value;
 if(!(x>XL(f)+S.b.t+20&&x<XR(f)-S.b.t-20)){msg(`벽 위치(x)는 ${XL(f)+S.b.t+20}~${XR(f)-S.b.t-20}cm 사이여야 해요`);$('#pX').focus();return}
 const p={id:uid(),f,x:Math.round(x),t:12,mat:S.b.mat.wall};S.parts.push(p);sel=p.id;$('#pX').value='';commit();sync();render();msg(`${fnameKo(f)}에 벽을 추가했어요 (x ${p.x}cm)`)};
$('#pDraw').onclick=()=>setTool(tool==='wall'?null:'wall');
$('#oFloor').onchange=()=>sync();
$('#oAdd').onclick=()=>{const kind=$('#oKind').value,f=+$('#oFloor').value,on=$('#oOn').value;const dr=kind==='door';
 const o={id:uid(),kind,f,on,x:Math.round(S.b.w/2),w:dr?90:120,sill:dr?0:90,h:dr?210:120};if(o.sill+o.h>fh(f)-sl(f+1)-10){o.h=Math.max(40,fh(f)-sl(f+1)-10-o.sill)}
 S.ops.push(o);sel=o.id;commit();sync();render()};
$('#sAdd').onclick=()=>{if(S.b.f<2){msg('계단은 2개 층 이상일 때 만들 수 있어요');return}const f=+$('#sFloor').value;const type=$('#sType').value;const a={id:uid(),type,f,x:Math.round(S.b.t+60),run:Math.min(300,S.b.w/3),dir:1,land:100,mat:'concrete',w:0};S.stairs.push(a);sel=a.id;commit();sync();render()};
$('#wxFloor').onchange=()=>{$('#wxW').value='';sync()};
$('#wxApply').onclick=()=>{const f=+$('#wxFloor').value,t=S.b.t,nw=Math.round((+$('#wxW').value||0)/5)*5,an=$('#wxAnchor').value;
 if(!(nw>=Math.max(100,2*t+60))){msg(`폭은 ${Math.max(100,2*t+60)}cm 이상이어야 해요`);return}if(nw>4000){msg('폭은 4000cm 이하로 해 주세요');return}
 const l=XL(f),r=XR(f),c=(l+r)/2;let nl,nr;if(an==='L'){nl=l;nr=l+nw}else if(an==='R'){nr=r;nl=r-nw}else{nl=Math.round((c-nw/2)/5)*5;nr=nl+nw}
 S.b.ext[f]={l:nl,r:nr};const lo=nl+t,hi=nr-t,dropped=S.parts.filter(q=>q.f===f&&(q.x-q.t/2<lo||q.x+q.t/2>hi));
 S.parts=S.parts.filter(q=>!dropped.includes(q));S.ops=S.ops.filter(o=>!dropped.some(q=>q.id===o.on));
 // 줄어든 범위 밖으로 나간 가구는 가장 가까운 안쪽으로 이동
 S.items.forEach(it=>{if(nearLevel(it.e).k===f&&nearLevel(it.e).d<40){it.x=clamp(it.x,lo+it.w/2,hi-it.w/2<lo+it.w/2?(lo+hi)/2:hi-it.w/2)}});
 commit();sync();render();fit();msg(`${fnameKo(f)} 폭을 ${nw}cm 로 바꿨어요`+(dropped.length?` (범위 밖 내벽 ${dropped.length}개는 지웠어요)`:''))};
$('#raAdd').onclick=()=>{const f=+$('#raFloor').value,side=$('#raSide').value,w=Math.round((+$('#raW').value||0)/5)*5,t=S.b.t;
 if(!(w>=100&&w<=2000)){msg('방 폭은 100~2000cm 로 정해 주세요');return}
 const e=S.b.ext[f],ws=S.b.mat.wall,q={id:uid(),f,x:side==='R'?e.r-t/2:e.l+t/2,t,mat:ws};
 // 기존 외벽이 안쪽 벽(내벽)이 되고, 새 방의 바깥 둘레가 새 외벽이 된다. 기존 외벽의 문·창은 그대로 새 내벽에 남는다.
 S.ops.forEach(o=>{if(o.f===f&&o.on===side)o.on=q.id});
 if(side==='L'){const k0=f+':L';if(S.rooms[k0]!==undefined){S.rooms[f+':'+q.id]=S.rooms[k0];delete S.rooms[k0]}}
 S.parts.push(q);if(side==='R')e.r+=w;else e.l-=w;sel=q.id;commit();sync();render();fit();msg(`${fnameKo(f)} ${side==='R'?'오른쪽':'왼쪽'} 바깥에 방(폭 ${w}cm)을 붙였어요. 새 방의 바깥 둘레가 외벽이에요`)};
$('#tfAdd').onclick=()=>{const f=+$('#tfFloor').value,side=$('#tfSide').value,w=Math.round((+$('#tfW').value||0)/5)*5,fk=Math.min(f,S.b.f-1);
 if(!(w>=40&&w<=2000)){msg('테라스 폭은 40~2000cm 로 정해 주세요');return}
 const q={id:uid(),f,x0:side==='R'?XR(fk):XL(fk)-w,x1:side==='R'?XR(fk)+w:XL(fk),rail:$('#tfRail').value,slab:true};
 S.terr.push(q);sel=q.id;commit();sync();render();fit();msg('테라스를 추가했어요 (난간 모양은 오른쪽 속성창에서 바꿀 수 있어요)')};
$('#oxAdd').onclick=()=>{const f=+$('#oxFloor').value,side=$('#oxSide').value;let note='';
 if(f===BB()&&Math.abs(lvl(f)-gE())<8){S.b.rz=Math.max(S.b.rz||0,45);note=' 현관 앞 계단을 만들려고 1층 바닥을 지면보다 45cm 높였어요(건물 탭에서 조절)'}
 const a={id:uid(),type:'outer',f,from:-1,side,run:0,n:0,mat:'concrete',dir:1,x:0};S.stairs.push(a);sel=a.id;commit();sync();render();fit();
 msg((stairGeo(a)?'건물 밖 계단을 추가했어요.':'이 층은 지면과 높이가 같아 계단이 보이지 않아요. 속성창에서 출발을 다른 층으로 바꾸거나 건물 탭의 1층 바닥 높이를 올려 주세요.')+note)};
$('#optVoid').onchange=e=>{S.b.void=e.target.checked;commit();render()};
$('#curFloor').onchange=e=>curF=+e.target.value;
/* 표현 탭 */
const lwSet=(id,key,min,max)=>$(id).addEventListener('change',e=>{S.lw[key]=clamp(+e.target.value||S.lw[key],min,max);commit();sync();render()});
lwSet('#lwOut','out',.3,6);lwSet('#lwInn','inn',.1,3);lwSet('#lwCut','cut',.5,8);
$('#lwAuto').onchange=e=>{S.lw.auto=e.target.checked;commit();render()};
$('#mWall').onchange=e=>{S.b.mat.wall=e.target.value;S.parts.forEach(p=>p.mat=e.target.value);commit();render()};
$('#mSlab').onchange=e=>{S.b.mat.slab=e.target.value;commit();render()};
$('#mRoof').onchange=e=>{S.b.mat.roof=e.target.value;commit();render()};
$('#hsc').onchange=e=>{S.b.hsc=clamp(+e.target.value||1,.4,4);commit();render()};
$('#hang').onchange=e=>{S.b.hang=clamp(+e.target.value||0,-90,90);commit();render()};
$('#hw').onchange=e=>{S.b.hw=clamp(+e.target.value||1,.2,4);commit();render()};
$('#bOp').onchange=e=>{S.lw.bOp=clamp(+e.target.value||.75,.1,1);commit();render()};
$('#bDash').onchange=e=>{S.lw.bDash=e.target.checked;commit();render()};
$('#layList').addEventListener('change',e=>{const k=e.target.dataset.ly;if(!k)return;S.layers[k]=e.target.checked?1:0;if(!S.layers[k]&&sel&&!svg.querySelector(`[data-id="${sel}"]`))sel=null;commit();render()});
$('#wpList').addEventListener('change',e=>{const t=e.target;if(t.dataset.wpall!==undefined){if(!t.value)return;S.b.wp=S.b.wp.map(()=>t.value)}else if(t.dataset.wp!==undefined)S.b.wp[+t.dataset.wp]=t.value;else return;commit();sync();render()});
/* ---------- 라이브러리 ---------- */
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));$('#tLib').hidden=b.dataset.t!=='lib';$('#tHouse').hidden=b.dataset.t!=='house';$('#tDraw').hidden=b.dataset.t!=='draw';if(b.dataset.t!=='house')setTool(null)});
function filtered(){const q=$('#q').value.trim().toLowerCase(),c=$('#fcat').value,os=$('#onlySide').checked;
 return A.filter(a=>(!c||a.categoryId===c)&&(!os||a.views.leftSide||a.views.rightSide)&&(!q||(a.nameKo+' '+a.nameEn+' '+a.assetId+' '+(a.tags||[]).join(' ')).toLowerCase().includes(q)))}
function prefetch(a){const k=avail(a)[0];const v=a.views[k];if(!v)return;art(v.svg,true);if(v.fill)art(v.fill,true)}
function renderLib(){const L=filtered();$('#count').textContent=`${L.length}개`;const g=$('#grid');const fr=document.createDocumentFragment();
 L.slice(0,shown).forEach(a=>{const v=a.views.front||a.views.rightSide||a.views.leftSide;const d=document.createElement('div');d.className='tile';d.draggable=true;d.title=a.nameKo+'\n'+a.assetId;
  d.innerHTML=`<div class="im"><img loading="lazy" decoding="async" width="130" height="72" src="${LIB}${a.thumb||v.svg}" alt=""></div><b>${esc(a.nameKo)}</b><i>${[a.views.front&&'front',(a.views.leftSide||a.views.rightSide)&&'side'].filter(Boolean).join('·')}${a.status==='review'?' ⚠':''}</i>`;
  d.onclick=()=>addAsset(a.assetId);d.addEventListener('pointerenter',()=>prefetch(a),{once:true});d.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','asset:'+a.assetId);prefetch(a)});fr.appendChild(d)});
 g.replaceChildren(fr);$('#more').hidden=L.length<=shown}
let qT=0;
$('#more').onclick=()=>{shown+=60;renderLib()};$('#q').addEventListener('input',()=>{clearTimeout(qT);qT=setTimeout(()=>{shown=60;renderLib()},120)});['fcat','onlySide'].forEach(i=>$('#'+i).addEventListener('input',()=>{shown=60;renderLib()}));
/* ---------- 내 단면도: 이 브라우저에 자동 저장(최대 5개) ---------- */
const SLOT_MAX=5,SK='sectionSite.slots',OLD_AUTO='sectionSite.auto',OLD_SAVES='sectionSite.saves';
let SL={v:1,cur:'1',slots:{}};
const blankDoc=()=>({v:2,title:'',b:{...DEF_B},parts:[],items:[]});
function slotsRead(){try{const j=JSON.parse(localStorage.getItem(SK)||'null');if(j&&j.slots&&typeof j.slots==='object'){SL={v:1,cur:String(j.cur||'1'),slots:j.slots};return true}}catch(e){}return false}
function slotsMigrate(){ // 예전 버전의 자동 저장/이름 저장이 있으면 슬롯으로 옮김
 const put=(name,doc,t)=>{const id=[1,2,3,4,5].map(String).find(i=>!SL.slots[i]);if(id&&doc&&doc.b&&doc.items)SL.slots[id]={name,t:t||Date.now(),doc}};
 try{const a=JSON.parse(localStorage.getItem(OLD_AUTO)||'null');if(a)put('',a)}catch(e){}
 try{const o=JSON.parse(localStorage.getItem(OLD_SAVES)||'{}');Object.entries(o).sort((x,y)=>(y[1].t||0)-(x[1].t||0)).forEach(([n,v])=>put(n,v.data,v.t))}catch(e){}
 SL.cur=Object.keys(SL.slots)[0]||'1'}
const slotName=id=>{const x=SL.slots[id];return x?(x.name||(x.doc&&x.doc.title)||('단면도 '+id)):''};
let pT=0,warned=false;
const HK={change:[],save:null};   // 공동 편집 연결부(viv-collab.js): 문서가 바뀔 때 알림, 저장 버튼 가로채기
let READY=false;   // 저장된 칸을 다 읽기 전에는 빈 화면 상태로 저장 칸을 덮어쓰지 않는다(시작 중에 비바리움 탭이 먼저 저장을 부르는 경우 방지)
function persistNow(){clearTimeout(pT);pT=0;if(!READY)return;try{const old=SL.slots[SL.cur]||{};SL.slots[SL.cur]={name:old.name||'',t:Date.now(),doc:S};localStorage.setItem(SK,JSON.stringify(SL));slotBtn();HK.change.forEach(f=>{try{f()}catch(e2){}})}catch(e){if(!warned){warned=true;msg('저장 공간이 부족하거나 브라우저가 저장을 막고 있어요. 자동 저장이 되지 않을 수 있어요')}}}
function persist(){clearTimeout(pT);pT=setTimeout(persistNow,350)}
addEventListener('pagehide',()=>{if(pT)persistNow()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&pT)persistNow()});
const slotCount=()=>Object.keys(SL.slots).length;
function slotBtn(){const b=$('#bSlots');if(b)b.textContent=`내 단면도 (${slotCount()}/${SLOT_MAX})`}
function dlg(html){const d=$('#dlg');d.innerHTML=html+'<form method="dialog" style="margin-top:10px"><button>닫기</button></form>';d.showModal();return d}
const cleanName=n=>String(n||'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'').trim().slice(0,80);
function askName(title,def,ext){return new Promise(res=>{const d=$('#dlg');d.innerHTML=`<h3>${esc(title)}</h3><div class="row" style="align-items:center"><input id="fnIn" style="flex:1;width:auto" value="${esc(def)}">${ext?`<span>.${ext}</span>`:''}</div><form method="dialog" style="margin-top:10px;display:flex;gap:6px"><button value="ok">저장</button><button value="cancel">취소</button></form>`;
  d.onclose=()=>{d.onclose=null;const v=cleanName($('#fnIn')&&$('#fnIn').value);res(d.returnValue==='ok'?(v||def):null)};d.returnValue='';d.showModal();const i=$('#fnIn');i.select();i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();d.close('ok')}}})}
const baseName=()=>cleanName(slotName(SL.cur))||cleanName(S.title)||'단면도';
function load(data){S=norm(clone(data));hist=[JSON.stringify(S)];fut=[];sel=null;curF=BB();sync();render();fit();btns();persistNow()}
function openSlot(id){if(!SL.slots[id]||id===SL.cur)return;persistNow();SL.cur=id;load(SL.slots[id].doc);msg('열었어요: '+slotName(id))}
function newSlot(){const id=[1,2,3,4,5].map(String).find(i=>!SL.slots[i]);if(!id){msg(`단면도는 최대 ${SLOT_MAX}개까지 만들 수 있어요. 하나를 지우고 다시 시도하세요`);openSlots();return false}
 persistNow();SL.cur=id;SL.slots[id]={name:'',t:Date.now(),doc:blankDoc()};load(blankDoc());msg('새 단면도를 만들었어요');return true}
function openSlots(){persistNow();const rows=[1,2,3,4,5].map(String).map(id=>{const x=SL.slots[id];
  if(!x)return `<div class="it"><span style="color:#8a8493">슬롯 ${id} · 비어 있음</span><span><button data-n="${id}">새로 만들기</button></span></div>`;
  const when=new Date(x.t||0).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  return `<div class="it"><span><b>${esc(slotName(id))}</b>${id===SL.cur?' <em style="color:#2e8b57;font-style:normal">· 작업 중</em>':''}<br><small style="color:#8a8493">슬롯 ${id} · ${esc(when)} · 가구 ${(x.doc.items||[]).length}개</small></span><span><button data-o="${id}" ${id===SL.cur?'disabled':''}>열기</button> <button data-r="${id}">이름</button> <button data-d="${id}">삭제</button></span></div>`}).join('');
 const d=dlg(`<h3>내 단면도 (${slotCount()}/${SLOT_MAX})</h3>${rows}<p class="hint">작업 내용은 이 기기·이 브라우저에 <b>자동 저장</b>돼요. 새로고침하거나 컴퓨터를 껐다 켜도 그대로 이어서 작업할 수 있어요. (다른 기기·다른 브라우저, 시크릿 창, 사이트 데이터 삭제 시에는 보이지 않아요)</p>`);
 d.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{d.close();openSlot(b.dataset.o)});
 d.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{d.close();persistNow();const id=b.dataset.n;SL.cur=id;SL.slots[id]={name:'',t:Date.now(),doc:blankDoc()};load(blankDoc());msg('새 단면도를 만들었어요')});
 d.querySelectorAll('[data-r]').forEach(b=>b.onclick=async()=>{d.close();const id=b.dataset.r;const n=await askName('단면도 이름',slotName(id),'');if(n){SL.slots[id].name=n;persistNow()}openSlots()});
 d.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{const id=b.dataset.d;if(!confirm(`'${slotName(id)}' 을(를) 지울까요? 되돌릴 수 없어요.`))return;d.close();delete SL.slots[id];
   if(id===SL.cur){const nx=Object.keys(SL.slots)[0];if(nx){SL.cur=nx;load(SL.slots[nx].doc)}else{SL.cur=id;SL.slots[id]={name:'',t:Date.now(),doc:blankDoc()};load(blankDoc())}}
   persistNow();openSlots()})}
$('#bSlots').onclick=openSlots;
$('#bSave').onclick=async()=>{if(HK.save&&await HK.save())return;   // 공유 집과 연결된 단면도면 서버 저장
  const n=await askName('이 단면도의 이름 (이 브라우저에 저장)',slotName(SL.cur),'');if(!n)return;SL.slots[SL.cur]=SL.slots[SL.cur]||{};SL.slots[SL.cur].name=n;persistNow();msg('저장했어요: '+n)};
const dl=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)};
$('#bNew').onclick=()=>{newSlot()};
/* 도면 내보내기: 선택 표시를 빼고 건물 영역만 잘라 SVG/PNG 로 저장 (가구 선이 인라인 경로라 파일 하나로 완결) */
function exportSvg(){const b=S.b,top=EH()+(b.roof==='gable'?b.rh:b.roof==='flat'?30:0);const dep=-lvl(0)+b.s;const BN=bounds(),x0=BN.l-110,y0=-(top+(S.title?110:60)),w=(BN.r-BN.l)+260,h=top+dep+(S.title?330:280);
 const c=svg.cloneNode(true);c.querySelectorAll('.sel,.guide').forEach(n=>n.remove());c.classList.remove('drag');c.removeAttribute('style');c.setAttribute('xmlns',NS);c.setAttribute('viewBox',`${x0} ${y0} ${w} ${h}`);c.setAttribute('width',w);c.setAttribute('height',h);
 const bg=document.createElementNS(NS,'rect');[['x',x0],['y',y0],['width',w],['height',h],['fill','#f7f6f2']].forEach(([k,v])=>bg.setAttribute(k,v));c.insertBefore(bg,c.firstChild);
 if(S.title){const tt=document.createElementNS(NS,'text');tt.setAttribute('x',x0+w/2);tt.setAttribute('y',y0+34);tt.setAttribute('text-anchor','middle');tt.setAttribute('style',"font:italic 800 26px Arial,'Noto Sans KR',sans-serif;fill:#1c1c1c");tt.textContent=S.title;c.appendChild(tt)}
 return {text:'<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(c),w,h,x0,y0}}
$('#bSvg').onclick=async()=>{const n=await askName('파일 이름 (SVG 도면)',baseName(),'svg');if(!n)return;const r=exportSvg();dl(new Blob([r.text],{type:'image/svg+xml'}),n+'.svg');msg('SVG 로 저장했어요')};
$('#bPng').onclick=async()=>{const n=await askName('파일 이름 (PNG 도면)',baseName(),'png');if(!n)return;const r=exportSvg();const img=new Image();img.onload=()=>{const k=1.6,cv=document.createElement('canvas');cv.width=Math.round(r.w*k);cv.height=Math.round(r.h*k);const cx=cv.getContext('2d');cx.drawImage(img,0,0,cv.width,cv.height);cv.toBlob(b2=>{dl(b2,n+'.png');msg('PNG 로 저장했어요')},'image/png')};img.onerror=()=>msg('PNG 변환에 실패했어요. SVG 로 저장해 보세요');img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(r.text)};
$('#undo').onclick=undo;$('#redo').onclick=redo;$('#zfit').onclick=fit;$('#zin').onclick=()=>{const c=VP.x+VP.w/2;VP.w/=1.25;VP.x=c-VP.w/2;applyVP()};$('#zout').onclick=()=>{const c=VP.x+VP.w/2;VP.w*=1.25;VP.x=c-VP.w/2;applyVP()};
$('#optGrid').checked=OPT.grid;$('#optFill').checked=OPT.fill;$('#optDims').checked=OPT.dims;
const saveOpt=()=>{try{localStorage.setItem('sectionSite.opt',JSON.stringify(OPT))}catch(e){}};
$('#optGrid').onchange=e=>{OPT.grid=e.target.checked;saveOpt();render()};$('#optFill').onchange=e=>{OPT.fill=e.target.checked;saveOpt();render()};$('#optDims').onchange=e=>{OPT.dims=e.target.checked;saveOpt();render()};
/* 좌/우 도구창 접기·펼치기 (보는 배율은 그대로 유지) */
const UI={L:true,R:true};try{Object.assign(UI,JSON.parse(localStorage.getItem('sectionSite.ui')||'{}'))}catch(e){}
function applyUI(keep){const st=$('#stage'),w0=st.getBoundingClientRect().width,c=VP.x+VP.w/2;const m=$('main');m.classList.toggle('hideL',!UI.L);m.classList.toggle('hideR',!UI.R);
 $('#tgL').textContent=UI.L?'◀':'▶';$('#tgR').textContent=UI.R?'▶':'◀';$('#tgL').title=UI.L?'왼쪽 도구창 접기':'왼쪽 도구창 펼치기';$('#tgR').title=UI.R?'오른쪽 속성창 접기':'오른쪽 속성창 펼치기';
 if(keep){const w1=st.getBoundingClientRect().width;if(w0&&w1){VP.w*=w1/w0;VP.x=c-VP.w/2}}applyVP()}
const togUI=k=>{UI[k]=!UI[k];try{localStorage.setItem('sectionSite.ui',JSON.stringify(UI))}catch(e){}applyUI(true)};
$('#tgL').onclick=()=>togUI('L');$('#tgR').onclick=()=>togUI('R');
window.__sec={get S(){return S},load,render,sync,weights:()=>weights(),stairGeo,findObj,setFloors,select:id=>{sel=id;drawSel();inspector();sync()}}; // 점검용
/* ---------- 시작 ---------- */
(async()=>{
 const cands=[...new Set([window.LIB||'',"../section-assets/","./section-assets/","section-assets/","/section-assets/"].filter(Boolean))];let tried=[],ok=false;
 for(const c of cands){try{const r=await fetch(c+'catalog/assets.json');tried.push(new URL(c+'catalog/assets.json',location.href).href+' → '+r.status);if(!r.ok)continue;const j=await r.json();LIB=c;const all=j.assets.filter(a=>a.status!=='failed'&&['front','leftSide','rightSide'].some(k=>a.views[k]));all.forEach(a=>AM[a.assetId]=a);A=all.filter(a=>!a.stairAsset); // 계단 에셋은 건물 탭 '계단'에서만 사용
   const cc=await (await fetch(LIB+'catalog/category-config.json')).json();CATS=cc.categories;CATS.forEach(k=>$('#fcat').insertAdjacentHTML('beforeend',`<option value="${k.id}">${esc(k.nameKo)}</option>`));ok=true;break}catch(e){tried.push(new URL(c+'catalog/assets.json',location.href).href+' → '+e.message)}}
 if(!ok){const er=$('#err');er.hidden=false;er.innerHTML='<b>에셋 목록을 불러오지 못했어요.</b><br>'+(location.protocol==='file:'?'파일을 더블클릭으로 열면 브라우저가 데이터 읽기를 막습니다. 웹서버(또는 GitHub Pages)로 여세요.<br>':'<code>section-assets</code> 폴더가 <code>section-site</code> 폴더와 같은 위치에 올라가 있는지 확인하세요.<br>')+'<small>시도한 주소:<br>'+tried.map(esc).join('<br>')+'</small>';$('#count').textContent='가구 0개'}
 try{if(!slotsRead())slotsMigrate();const cs=SL.slots[SL.cur];if(cs&&cs.doc&&cs.doc.b&&cs.doc.items)S=norm(cs.doc);else{SL.cur=SL.cur||'1';SL.slots[SL.cur]=SL.slots[SL.cur]||{name:'',t:Date.now(),doc:S}}}catch(e){}
 READY=true;
 S.items=S.items.filter(i=>AM[i.assetId]||!Object.keys(AM).length);hist=[JSON.stringify(S)];curF=BB();sync();renderLib();render();fit();btns();applyUI(false);persistNow();
})();
/* 비바리움 관찰 탭(viv.js)용 읽기 전용 연결부: 편집기 내부 함수·상태를 그대로 재사용하기 위해 필요한 항목만 노출 */
function slotCreate(doc,name){const id=[1,2,3,4,5].map(String).find(i=>!SL.slots[i]);if(!id)return null;persistNow();SL.cur=id;SL.slots[id]={name:name||'',t:Date.now(),doc:clone(doc)};load(doc);return id}
window.SectionBridge={get ready(){return READY},HK,slotCreate,slotOpen:openSlot,loadDoc:load,msg,get SLOT_MAX(){return SLOT_MAX},get S(){return S},set S(v){S=v},get sel(){return sel},set sel(v){sel=v},get SL(){return SL},get AM(){return AM},norm,render,exportSvg,EH,lvl,sl,fnameKo,OPT,STAIR_ASSET,art,ART,applyVP,persistNow,slotName,esc,roomsOf,stairGeo,fh,BB};
})();
