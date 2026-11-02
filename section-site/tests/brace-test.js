/* 문구 속 미치환 자리표시자({p}·{o}·{r} 등) 검사: 연애 상태 5종 × 성격 몇 가지로 돌려 기억·일지 문구에 { } 가 남지 않는지 확인 */
globalThis.window=globalThis;const P=__dirname+'/../';['viv-ko','sim','viv-mind','viv-social','viv-chain','viv-aware','viv-decide','viv-love','viv-romfx'].forEach(f=>require(P+f+'.js'));
const M=Mind;let bad=[],n=0;const T0=Date.UTC(2026,9,30,12,0,0);
const chk=(w,t)=>{n++;if(/[{}]/.test(String(t)))bad.push(w+': '+t)};
for(const st of ['none','crush','oneside','mutual','lover','spouse'])for(const tr of [{shy:.9},{tsun:.9,aloof:.6},{jealous:.9,cling:.8},{bold:.9,caring:.7}]){
  const s=M.create();const chars=[{id:'a',name:'가온'},{id:'b',name:'나래'},{id:'c',name:'다솔'}];const A=ch=>({traits:ch.id==='a'?tr:{},facts:{partners:[]}});
  const env=M.env(chars,A,T0,'2026-10-30');
  const inp=(now,r)=>({now,hour:12,day:'2026-10-30',chars,A,cur:{a:{mode:'home',action:'rest',verb:'idle',seg:1},b:{mode:'home',action:'rest',verb:'idle',seg:r?1:2},c:{mode:'home',action:'rest',verb:'idle',seg:1}},prev:{}});
  M.update(s,inp(T0,true));if(st!=='none')try{M.setRomance(s,'a','b',st,env)}catch(e){}
  for(let i=1;i<=60;i++)M.update(s,inp(T0+i*15*60000,i%7<4));
  for(const o of Object.keys(s.mem||{}))for(const m of s.mem[o])chk('기억 '+st,m.sum);
  for(const e of ((s.soc&&s.soc.log)||[])){for(const k of Object.keys(e))if(typeof e[k]==='string')chk('일지 '+st+'/'+e.type+'.'+k,e[k])}
}
console.log('검사한 문구',n,'건 / 미치환',bad.length);bad.slice(0,10).forEach(x=>console.log('FAIL '+x));
if(!bad.length)console.log('ok 미치환 자리표시자 없음');process.exit(bad.length?1:0)
