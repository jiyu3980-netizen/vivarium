/* 연애 상태 × 성격 영향 시험: 같은 조건에서 상태·성격만 바꿔 6개 영역이 달라지는지 확인 */
globalThis.window=globalThis;const P=__dirname+'/../';['viv-ko','sim','viv-mind','viv-social','viv-chain','viv-aware','viv-decide','viv-love','viv-romfx'].forEach(f=>require(P+f+'.js'));
const M=Mind;let pass=0,fails=0;const ok=(n,c,x)=>{c?pass++:fails++;console.log((c?'ok   ':'FAIL ')+n+(x?'  '+x:''))};
const T0=Date.UTC(2026,9,30,12,0,0);
const mkA=tr=>({traits:tr,facts:{partners:[]}});
function run(state,trA,trB,opt={}){
  const s=M.create();const chars=[{id:'a',name:'가온'},{id:'b',name:'나래'},{id:'c',name:'다솔'}];
  const A=ch=>ch.id==='a'?mkA(trA):mkA(trB||{});
  const inp0=(now,room)=>({now,hour:12,day:'2026-10-30',chars,A,cur:{a:{mode:'home',action:'rest',verb:'idle',seg:1},b:{mode:'home',action:'rest',verb:'idle',seg:room?1:2},c:{mode:'home',action:'rest',verb:'idle',seg:opt.third?1:3}},prev:{}});
  const env=M.env(chars,A,T0,'2026-10-30');
  s.rel&&0;M.update(s,inp0(T0,true));
  if(state==='crush')M.setRomance(s,'a','b','crush',env);else if(state==='oneside')M.setRomance(s,'a','b','oneside',env);else if(state==='mutual')M.setRomance(s,'a','b','mutual',env);else if(state==='lover')M.setRomance(s,'a','b','lover',env);else if(state==='spouse')M.setRomance(s,'a','b','spouse',env);
  if(opt.third){const R=s.rel[M.pk('b','c')]||M.rel(s,'b','c',env);R.aff=60}
  const aff0=s.rel[M.pk('a','b')].aff;let ex=0,anx=0,lon=0,irr=0,hap=0,n=0;
  for(let i=1;i<=24;i++){const t=T0+i*15*60000;M.update(s,inp0(t,opt.room!==false));const e=s.emo.a.lv;ex+=e.excited.v;anx+=e.anxious.v;lon+=e.lonely.v;irr+=e.irritated.v;hap+=e.happy.v;n++}
  const mem=(s.mem.a||[]).filter(m=>/^rom_/.test(m.t)).map(m=>m.t);
  const jr=((s.soc&&s.soc.log)||[]).filter(e=>/^rom_/.test(e.type)).map(e=>e.type);
  return {s,aff:s.rel[M.pk('a','b')].aff-aff0,ex:ex/n,anx:anx/n,lon:lon/n,irr:irr/n,hap:hap/n,mem,jr,H:M.hooks(s,T0+99*60000)}}
const none=run('none',{}),crushShy=run('crush',{shy:.9}),crushBold=run('crush',{bold:.9}),lover=run('lover',{caring:.6}),loverTsun=run('lover',{tsun:.9,aloof:.6});
ok('감정: 짝사랑하면 곁에 있을 때 설렘이 커짐',crushBold.ex>none.ex+5,`없음 ${none.ex.toFixed(1)} → ${crushBold.ex.toFixed(1)}`);
ok('감정×성격: 소심한 짝사랑은 불안이 더 큼',crushShy.anx>crushBold.anx+3,`소심 ${crushShy.anx.toFixed(1)} vs 대담 ${crushBold.anx.toFixed(1)}`);
ok('감정: 연인과 떨어져 있으면 허전함(외로움)이 생김',run('lover',{caring:.6},{},{room:false}).lon>none.lon+3,'떨어짐 '+run('lover',{caring:.6},{},{room:false}).lon.toFixed(1));
ok('감정×성격: 질투가 큰 성격은 상대 곁의 제3자에 짜증이 오름',run('mutual',{jealous:.9},{},{third:true}).irr>run('mutual',{},{},{third:true}).irr+3);
ok('친밀도: 짝사랑하는 쪽은 곁에 머물수록 친밀도가 오름',crushBold.aff>none.aff,`+${crushBold.aff.toFixed(2)} vs +${none.aff.toFixed(2)}`);
ok('친밀도×성격: 무심·츤데레는 같은 연인이어도 쌓이는 속도가 느림',lover.aff>loverTsun.aff,`${lover.aff.toFixed(2)} vs ${loverTsun.aff.toFixed(2)}`);
ok('친밀도: 하루 상한(+12)을 넘지 않음',lover.aff<=12.01,lover.aff.toFixed(2));
ok('기억: 연애 상태가 있으면 설렘·포근함 기억이 쌓임',lover.mem.length+crushShy.mem.length+crushBold.mem.length>0&&none.mem.length===0,JSON.stringify([crushShy.mem,lover.mem]));
ok('일지: 눈에 띄는 마음의 움직임이 rom_* 사건으로 남음',lover.jr.length+crushShy.jr.length+crushBold.jr.length>0&&none.jr.length===0,JSON.stringify([crushShy.jr,lover.jr]));
const am=(r)=>r.H.acceptMul('b','a');
ok('상호작용: 연인(상대가 나를 좋아함)이면 받아들일 확률이 높음',(()=>{const a=run('lover',{}, {caring:.5}),b=run('none',{},{caring:.5});return a.H.acceptMul('a','b')>b.H.acceptMul('a','b')})());
ok('상호작용×성격: 츤데레는 좋아해도 덜 받아 줌',(()=>{const a=run('lover',{}, {caring:.5}),b=run('lover',{}, {tsun:.9,aloof:.6});return a.H.acceptMul('b','a')>b.H.acceptMul('b','a')})());
ok('행동: 다가가기 후보 보정(연인이 외로울 때)',!!M._rfx.dec(lover.s,'a','b',{},.8)&&!M._rfx.dec(none.s,'a','b',{},.8));
ok('행동: 소심한 짝사랑은 함께하기 배율이 대담한 쪽보다 낮음',crushShy.H.partnerMul('a','b')<crushBold.H.partnerMul('a','b'),crushShy.H.partnerMul('a','b').toFixed(2)+' vs '+crushBold.H.partnerMul('a','b').toFixed(2));
ok('결정성: 같은 입력이면 같은 결과',JSON.stringify(run('crush',{shy:.9}).mem)===JSON.stringify(crushShy.mem)&&Math.abs(run('lover',{caring:.6}).aff-lover.aff)<1e-9);
console.log(`\n통과 ${pass} / 실패 ${fails}`);process.exit(fails?1:0);
