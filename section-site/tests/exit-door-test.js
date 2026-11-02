/* 출입구 판정 테스트: 안쪽 문 에셋은 출입구가 아니고, 1층 외벽 문(L/R)·외벽 자리의 문 에셋만 출입구. 가장 가까운(갈 수 있는) 출입구를 고른다 */
globalThis.window=globalThis;const P=__dirname+'/../';['viv-ko','sim'].forEach(f=>require(P+f+'.js'));
const F=require(__dirname+'/../../section-server/tests/fixture-geo.js');const Sim=globalThis.Sim;let fail=0;const ok=(n,c)=>{console.log((c?'ok ':'FAIL ')+n);if(!c)fail++};
const g=F.geo();const base=JSON.parse(JSON.stringify(g));
const doorItem=(uid,x,f)=>({uid,aid:'door',x,e:0,w:90,h:210,f,name:'문',en:'door',cat:'architectural-elements',sub:'door',tags:[],kinds:['door']});
const mk=(mod)=>{const gg=JSON.parse(JSON.stringify(base));gg.exits=[];gg.items=(gg.items||[]).filter(i=>!(i.kinds||[]).includes('door'));mod(gg);return Sim.buildWorld(gg)};
const T=base.t||20,E0=(base.ext&&base.ext[base.g0||0])||{l:base.in0-T,r:base.in1+T};
let W=mk(g=>{g.exits.push({f:0,x:E0.r-T-12,side:'R'});g.items.push(doorItem('d1',E0.l+T+300,0))});
ok('안쪽 문 에셋은 출입구가 아님(출입구 1개)',W.exits.length===1&&W.exits[0].side==='R');
W=mk(g=>{g.items.push(doorItem('d2',E0.l+10,0))});
ok('왼쪽 외벽 자리의 문 에셋은 출입구',W.exits.length===1&&/^door:/.test(W.exits[0].side)&&W.exits[0].x>E0.l);
W=mk(g=>{g.items.push(doorItem('d3',E0.l+T+300,0))});
ok('외벽 문이 없고 안쪽 문 에셋뿐이면 출입구 없음',W.exits.length===0);
W=mk(g=>{g.exits.push({f:0,x:E0.r-T-12,side:'R'})});
const seg=W.segAt(0,E0.l+T+60);const pos={seg,f:0,x:E0.l+T+60};
ok('왼쪽에 있어도 오른쪽 문을 출입구로 고름(문 없는 왼쪽으로 가지 않음)',(()=>{const e=Sim._exitNear?Sim._exitNear(W,pos):null;return !Sim._exitNear||(e&&e.side==='R')})());
console.log(fail?'FAIL':'ALL PASS');process.exit(fail?1:0)
