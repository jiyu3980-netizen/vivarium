/* 같은 입력이면 같은 결과인지(결정성) + 나눠서 돌려도 한 번에 돌린 것과 같은지(재개 가능) 확인한다 */
globalThis.window=globalThis;const P=__dirname+'/../';['viv-ko','sim','viv-mind','viv-social','viv-chain','viv-aware','viv-decide','viv-love','viv-romfx','viv-uncanny','viv-engine'].forEach(f=>require(P+f+'.js'));
const F=require(__dirname+'/../../section-server/tests/fixture-geo.js');const {Sim,Mind,Uncanny:Unc,VivEngine:E}=globalThis;
function mk(){const W=Sim.buildWorld(F.geo()),res=F.chars().map(c=>({id:c.id,name:c.name,profile:c.profile,pet:null})),place={},sim={};
  const h={world:W,houseId:'h1',residents:res,guests:[],awayIds:new Set(),isMiss:()=>false,getPlace:id=>place[id]||(place[id]={mode:'home',house:'h1',f:0,x:W.mid}),setPlace:(id,o)=>{place[id]={...(place[id]||{}),...o}},getSim:id=>sim[id]||(sim[id]={v:1,updatedAt:0,needs:{}}),setSim:(id,o)=>{sim[id]={...(sim[id]||{}),...o}},mind:Mind.migrate(null),unc:Unc.migrate(null),neighbors:[],watch:null,mindAt:0};
  return {h,place,sim}}
const T0=Date.UTC(2026,9,23,0,0,0),T1=T0+7*86400000;
const snap=x=>JSON.stringify({p:x.place,s:x.sim,m:x.h.mind,u:x.h.unc});
const a=mk();const t0=Date.now();E.replay(a.h,T0,T1,{});const ms=Date.now()-t0;
const b=mk();let last=T0,n=0;for(;;){const r=E.replay(b.h,last,T1,{maxSteps:16});last=r.last;n++;if(r.done)break}
const c=mk();E.replay(c.h,T0,T1,{});
const sa=snap(a),sb=snap(b),sc=snap(c);
console.log('7일 한 번에',ms+'ms /',n,'번 나눠서 /','나눠도 같음:',sa===sb,'/ 다시 돌려도 같음:',sa===sc);
process.exit(sa===sb&&sa===sc?0:1);
