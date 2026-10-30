/* 공동 행동 세션 불변식 테스트: 7일 동안 5분 간격으로 돌리며 매 순간 '반쪽 세션'이 없는지 확인한다 */
globalThis.window=globalThis;const P=__dirname+'/../';['viv-ko','sim','viv-mind','viv-love','viv-social','viv-chain','viv-aware','viv-decide'].forEach(f=>require(P+f+'.js'));
const F=require(__dirname+'/../../section-server/tests/fixture-geo.js');const Sim=globalThis.Sim;
const W=Sim.buildWorld(F.geo());const chars=[...F.chars(),{id:'c_c',name:'소라',profile:'수다 떨기를 좋아하는 활발한 성격이에요.'}];
const place={},sim={};let bad=[];
const ctx=t=>({now:t,world:W,houseId:'h1',guests:[],chars:chars.map(c=>({...c})),getPlace:id=>place[id]||(place[id]={mode:'home',house:'h1',f:0,x:W.mid}),setPlace:(id,o)=>{place[id]={...(place[id]||{}),...o}},getSim:id=>sim[id]||(sim[id]={v:1,updatedAt:0,needs:{}}),setSim:(id,o)=>{sim[id]={...(sim[id]||{}),...o}},neighbors:[],analysis:c=>Sim.analyze(c.profile,c.name,chars),mind:null,unc:null});
const T0=Date.UTC(2026,9,30,8,0,0);let sessions=new Set(),pairTicks=0,ends={};
for(let t=T0;t<T0+7*86400000;t+=5*60000){Sim.stepHouse(ctx(t));
  for(const c of chars){const p=place[c.id];if(!p.ia){continue}
    const o=p.ia.m.find(x=>x!==c.id),q=place[o];sessions.add(p.ia.id);pairTicks++;
    if(!(q&&q.ia&&q.ia.id===p.ia.id&&q.verb===p.verb&&p.verb===p.ia.k&&q.partner===c.id&&p.partner===o&&q.mode==='home'&&p.mode==='home'))bad.push({t:new Date(t).toISOString(),c:c.id,p:{verb:p.verb,partner:p.partner,ia:p.ia.id},q:q&&{verb:q.verb,partner:q.partner,ia:q.ia&&q.ia.id,mode:q.mode}});
    if(!p.say||!q.say)bad.push({t,why:'empty say'})}
  for(const c of chars){const s=sim[c.id];if(s&&s.iaEnd){ends[s.iaEnd.why]=(ends[s.iaEnd.why]||0)+1}}}
console.log('세션',sessions.size,'개 / 짝 상태 관측',pairTicks,'회 / 위반',bad.length,'건 / 종료 이유 관측',JSON.stringify(ends));
bad.slice(0,5).forEach(b=>console.log(JSON.stringify(b)));process.exit(bad.length?1:0);
