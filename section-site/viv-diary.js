/* 관찰일지 문장 재료 — 그날 화면에 실제로 보인 행동·심리 지문(현재 진행형: '…는 중', '…고 있음')을 일지 문장(과거)으로 바꾼다.
   브라우저(이 기기에만 있는 집)와 서버(공유 집)가 같은 파일을 쓴다. 없는 일을 지어내지 않고, 확실히 바꿀 수 있는 끝맺음만 처리한다(못 바꾸면 쓰지 않음). */
(function(root){'use strict';
const KST=9*3600000;
const hsh=str=>{let h=2166136261;str=String(str);for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}h^=h>>>16;h=Math.imul(h,2246822507);h^=h>>>13;h=Math.imul(h,3266489909);h^=h>>>16;return h>>>0};
const pick=(arr,seed)=>arr[hsh(seed)%arr.length];
const TOD=h=>h<5?'새벽':h<9?'이른 아침':h<12?'오전':h<14?'점심 무렵':h<18?'오후':h<21?'저녁':'밤';
const todOf=t=>TOD(new Date(t+KST).getUTCHours());
function parts(say,m,seed){
  const x=String(say||'').trim().replace(/[.!?。…]+$/,'').replace(/이에요$/,'');
  if(!x||/[{}]/.test(x))return null;
  const ps=x.split(/,\s*/);if(ps.length>2)return null;
  const long=m>=60?[' 시간이 길었다',' 데 꽤 오랜 시간을 보냈다']:[];
  const lead=(c,last)=>{let y=null;if(/는 중$/.test(c))y=c.replace(/ 중$/,'');else if(/고 있음$/.test(c))y=c.replace(/음$/,'는');else return null;
    const ends=last?[' 모습이 눈에 띄었다',' 모습이 보였다',' 모습을 볼 수 있었다',...long]:[' 모습이 눈에 띄었고',' 모습이 보였고',' 모습이 눈에 들어왔고'];
    return y+pick(ends,seed+'|e')};
  const tail=c=>{const T=[['듯함','듯했다'],['해 보임','해 보였다'],['보임','보였다'],['있음','있었다'],['없음','없었다'],['않음','않았다'],['같음','같았다']];
    for(const [a,b] of T)if(c.endsWith(a))return c.slice(0,c.length-a.length)+b;return null};
  if(ps.length===1)return lead(ps[0],true);
  const a=lead(ps[0],false);if(!a)return null;const b=lead(ps[1],true)||tail(ps[1]);return b?a+', '+b:null}
/* rows: [{sx,m,t,g}] (m=머문 분, t=처음 본 시각, g=행동 그룹) → {text,score} | null */
function life(N,rows,seed){
  const list=rows.slice().sort((a,b)=>b.m-a.m||a.t-b.t||a.sx.localeCompare(b.sx)),conv=[];
  for(const r of list){if(conv.length>=6)break;const p=parts(r.sx,r.m,seed+'|'+r.sx);if(p)conv.push({...r,p})}
  if(!conv.length)return null;
  const eun=n=>root.Ko&&root.Ko.j?root.Ko.j(n,'eun'):n+'은(는)';
  const top=conv[0],second=conv.find(c=>c.g!==top.g&&Math.abs(c.t-top.t)>=2*3600000);let text;
  if(second&&!top.p.includes(', ')&&!second.p.includes(', ')&&hsh(seed+'|pair')%3!==0){
    const [f,g2]=top.t<=second.t?[top,second]:[second,top];
    const A=f.p.replace(/(눈에 띄었다|보였다|볼 수 있었다|길었다|보냈다)$/,m=>({'눈에 띄었다':'눈에 띄었고','보였다':'보였고','볼 수 있었다':'볼 수 있었고','길었다':'길었고','보냈다':'보냈고'})[m]);
    text=`${eun(N)} ${todOf(f.t)}에는 ${A}, ${todOf(g2.t)}에는 ${g2.p}`}
  else text=pick([`${eun(N)} ${todOf(top.t)}에 ${top.p}`,`${todOf(top.t)}, ${eun(N)} ${top.p}`,`${eun(N)} ${top.p}`],seed+'|f');
  return {text,score:14+Math.min(14,top.m/30)}}
root.VivDiary={hsh,pick,todOf,parts,life};
if(typeof module!=='undefined'&&module.exports)module.exports=root.VivDiary;
})(typeof globalThis!=='undefined'?globalThis:window);
