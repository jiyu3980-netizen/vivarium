/* 도면 3-way 병합 — 기준(base) / 내 편집(mine) / 서버 최신(theirs)
   - 순수 함수(브라우저·Node 공통). 병합할 수 있으면 합치고, 같은 값을 서로 다르게 바꿨거나 한쪽은 지우고 한쪽은 고친 경우는 '충돌'로 보고한다.
   - 한쪽이 지운 객체(가구·벽·문·계단)는 다른 쪽이 건드리지 않았다면 그대로 삭제된다 → 오래된 편집기가 삭제된 객체를 되살리지 못한다.
   - id/uid 로 구분되는 배열(items, parts, ops, stairs)은 객체 단위로, 그 밖의 객체는 속성 단위로 비교한다. */
(function(root){
const stable=v=>{if(v===undefined)return 'u';if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}'};
const eq=(a,b)=>stable(a)===stable(b);
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const keyOf=o=>isObj(o)?(o.uid!=null?'u:'+o.uid:(o.id!=null?'i:'+o.id:null)):null;
const keyed=a=>Array.isArray(a)&&a.length>0&&a.every(x=>keyOf(x)!==null);
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const LABEL={items:'가구',parts:'내벽',ops:'문·창문',stairs:'계단',terr:'테라스',rooms:'방 이름',b:'건물 설정',lw:'선 굵기',layers:'레이어',title:'제목'};

function merge3(base,mine,theirs,opts){
  opts=opts||{};const prefer=opts.prefer==='theirs'?'theirs':'mine',nameOf=opts.nameOf||null,conflicts=[];
  const pick=(a,t)=>prefer==='mine'?a:t;
  const desc=(path,obj)=>{const top=path[0],lab=LABEL[top]||top;let nm='';if(nameOf&&obj&&typeof obj==='object')try{nm=nameOf(top,obj)||''}catch(e){}return nm?`${lab} '${nm}'`:lab};
  function m(b,a,t,path,ctxObj){
    if(eq(a,t))return a;
    if(eq(b,a))return t;
    if(eq(b,t))return a;
    if(keyed(a)||keyed(t)||keyed(b)){
      const A=Array.isArray(a)?a:[],T=Array.isArray(t)?t:[],Bb=Array.isArray(b)?b:[];
      if([A,T,Bb].every(x=>x.length===0||keyed(x)))return mergeKeyed(Bb,A,T,path)}
    if(isObj(a)&&isObj(t)&&(isObj(b)||b===undefined))return mergeObj(isObj(b)?b:{},a,t,path);
    conflicts.push({path:path.join('.'),what:desc(path,ctxObj||a),kind:'both-changed',mine:clone(a),theirs:clone(t)});return clone(pick(a,t))}
  function mergeObj(b,a,t,path){
    const out={},keys=new Set([...Object.keys(b),...Object.keys(a),...Object.keys(t)]);
    for(const k of keys){const r=m(b[k],a[k],t[k],[...path,k],a);if(r!==undefined)out[k]=clone(r)}
    return out}
  function mergeKeyed(b,a,t,path){
    const M=arr=>{const mp=new Map();arr.forEach(x=>mp.set(keyOf(x),x));return mp},mb=M(b),ma=M(a),mt=M(t);
    const order=[...mt.keys(),...[...ma.keys()].filter(k=>!mt.has(k))],out=[];
    for(const k of [...new Set([...order,...mb.keys()])]){
      const inB=mb.has(k),inA=ma.has(k),inT=mt.has(k),vb=mb.get(k),va=ma.get(k),vt=mt.get(k);
      if(!inB){ // 새로 추가
        if(inA&&inT){out.push(clone(m(undefined,va,vt,[...path,k],va)));continue}
        out.push(clone(inA?va:vt));continue}
      if(!inA&&!inT)continue;                                            // 양쪽이 모두 삭제
      if(!inA){ // 내가 삭제
        if(eq(vb,vt))continue;                                           // 상대는 안 건드림 → 삭제
        conflicts.push({path:[...path,k].join('.'),what:desc(path,vt),kind:'deleted-by-me',mine:null,theirs:clone(vt)});if(prefer==='theirs')out.push(clone(vt));continue}
      if(!inT){ // 상대가 삭제
        if(eq(vb,va))continue;                                           // 내가 안 건드림 → 삭제 유지(되살리지 않음)
        conflicts.push({path:[...path,k].join('.'),what:desc(path,va),kind:'deleted-by-them',mine:clone(va),theirs:null});if(prefer==='mine')out.push(clone(va));continue}
      out.push(clone(m(vb,va,vt,[...path,k],va)))}
    return out}
  const merged=m(base,mine,theirs,[],mine)||{};
  /* 참조 검사: 벽을 지웠는데 그 벽에 붙은 문·창문이 남으면 안전하지 않다 → 충돌로 알리고 고아 객체는 제거 */
  const ids=new Set((merged.parts||[]).map(p=>p.id));
  if(Array.isArray(merged.ops)){const keep=[];for(const o of merged.ops){if(o.on&&!['L','R','back'].includes(o.on)&&!ids.has(o.on)){conflicts.push({path:'ops.'+o.id,what:desc(['ops'],o),kind:'orphan',mine:null,theirs:null});continue}keep.push(o)}merged.ops=keep}
  return {merged,conflicts,clean:conflicts.length===0}}

/* 변경 요약(알림용): 컬렉션별 추가·삭제·수정 개수 */
function summarize(base,doc){
  const s={};const cnt=(k,a,b)=>{const A=Array.isArray(a)?a:[],B=Array.isArray(b)?b:[];const ma=new Map(A.map(x=>[keyOf(x),x])),mb=new Map(B.map(x=>[keyOf(x),x]));let add=0,del=0,chg=0;
    for(const [id,v] of mb){if(!ma.has(id))add++;else if(!eq(ma.get(id),v))chg++}for(const id of ma.keys())if(!mb.has(id))del++;if(add||del||chg)s[k]={add,del,chg}};
  for(const k of ['items','parts','ops','stairs','terr'])cnt(k,base&&base[k],doc&&doc[k]);
  let other=0;for(const k of new Set([...Object.keys(base||{}),...Object.keys(doc||{})])){if(['items','parts','ops','stairs','terr'].includes(k))continue;if(!eq((base||{})[k],(doc||{})[k]))other++}
  if(other)s.etc={chg:other};return s}
const summaryText=s=>{if(!s)return '';const p=[];const L={items:'가구',parts:'내벽',ops:'문·창',stairs:'계단',terr:'테라스'};
  for(const k of Object.keys(L)){const v=s[k];if(!v)continue;const t=[];if(v.add)t.push('+'+v.add);if(v.del)t.push('−'+v.del);if(v.chg)t.push('수정 '+v.chg);p.push(`${L[k]} ${t.join(' ')}`)}
  if(s.etc)p.push('설정 변경');return p.join(' · ')};

const api={merge3,summarize,summaryText,stable,eq};
root.DocMerge=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
