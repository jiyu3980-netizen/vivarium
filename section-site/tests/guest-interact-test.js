/* 같은 입력이면 같은 결과인지(결정성) + 나눠서 돌려도 한 번에 돌린 것과 같은지(재개 가능) 확인한다 */
globalThis.window=globalThis;const P=__dirname+'/../';['viv-ko','sim','viv-mind','viv-social','viv-chain','viv-aware','viv-decide','viv-love','viv-romfx','viv-uncanny','viv-engine'].forEach(f=>require(P+f+'.js'));
const F=require(__dirname+'/../../section-server/tests/fixture-geo.js');const {Sim,Mind,Uncanny:Unc,VivEngine:E}=globalThis;
const ok=(n,c,x)=>{console.log((c?'ok   ':'FAIL ')+n+(x?'  '+x:''));if(!c)process.exitCode=1};
/* 이웃집에 놀러 온 손님(vg:)이 있는 집을 이틀 돌려, 손님과 집주인 캐릭터가 실제로 상호작용하는지 본다 */
const W=Sim.buildWorld(F.geo()),res=F.chars().slice(0,2).map(c=>({id:c.id,name:c.name,profile:c.profile,pet:null})),place={},sim={},seen=[];
const gid='vg:c_guest';const guests=[{id:gid,realId:'c_guest',name:'손님이',profile:'사교적이고 대화를 좋아해요'}];
place[gid]={mode:'home',house:'h1',f:0,x:W.mid};
const h={world:W,houseId:'h1',residents:res,guests,awayIds:new Set(),isMiss:()=>false,getPlace:id=>place[id]||(place[id]={mode:'home',house:'h1',f:0,x:W.mid}),
 setPlace:(id,o)=>{place[id]={...(place[id]||{}),...o};if(o.verb||o.say)seen.push({id,verb:place[id].verb,say:place[id].say||'',partner:place[id].partner||null})},
 getSim:id=>sim[id]||(sim[id]={v:1,updatedAt:0,needs:{}}),setSim:(id,o)=>{sim[id]={...(sim[id]||{}),...o}},mind:Mind.migrate(null),unc:Unc.migrate(null),neighbors:[],watch:null,mindAt:0};
const T0=Date.UTC(2026,9,23,0,0,0);E.replay(h,T0,T0+2*86400000,{});
const gAct=seen.filter(x=>x.id===gid),hAct=seen.filter(x=>x.id!==gid);
ok('손님이 집 안에서 행동함',gAct.length>0,gAct.length+'건');
const gver=[...new Set(gAct.map(x=>x.verb))];console.log('  손님 행동 종류',gver.slice(0,12).join(','));
const withG=hAct.filter(x=>/손님이/.test(x.say));ok('집주인 캐릭터가 손님에게 말을 걸거나 함께하는 행동이 나옴',withG.length>0,withG.length+'건 예: '+(withG[0]&&withG[0].say));
const gw=gAct.filter(x=>/초원|아라|보리|달이|하루/.test(x.say)||x.partner);console.log('  손님 쪽 상대 있는 행동',gw.length,'건');
const rel=Object.entries(h.mind.rel||{}).filter(([k])=>k.includes('c_guest'));ok('손님과 집주인 캐릭터 사이 관계가 생김',rel.length>0,rel.map(([k,v])=>v.type+'/'+v.aff).join(' '));
ok('손님과의 첫 관계는 룸메이트가 아닌 방문 계기',rel.every(([k,v])=>v.type!=='roommate'&&/놀러/.test(v.origin||'')),rel.map(([k,v])=>v.origin).slice(0,1).join());
ok('손님은 집에서 잠들지 않음(v25 규칙)',!gAct.some(x=>/sleep|nap/.test(x.verb||'')));
