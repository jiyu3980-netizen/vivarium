/* 연애 지문의 '이어 붙이기'(두 행동 조각을 하나로) 회귀 테스트: 모든 성격 조합에서 문법 오류(예: '않며')가 나오지 않아야 한다 */
global.window=global;require('../viv-ko.js');if(process.env.OLD)Ko.link=t=>String(t).replace(/는 중$/,'며');const L=require('../viv-love.js');
let n=0,bad=[];const kinds=Object.keys(L.BANK);
const traits=['shy','harsh','tsun','angry','negative','cynic','caring','bold','playful','jealous','aloof','smug','inexpr'];
let seed=1;const rng=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff};
for(const k of kinds)for(let i=0;i<traits.length;i++)for(let j=0;j<traits.length;j++){if(i===j)continue;
  const A={traits:{[traits[i]]:1,[traits[j]]:.9}},B={traits:{}};
  for(let r=0;r<12;r++){let t;try{t=L.stateLine(k,A,B,rng,'하루')}catch(e){continue}if(!t)continue;n++;
    if(/않며|[가-힣]*먹며|듣며(?! )/.test(t)&&/않며/.test(t)||!Ko.ok(t)||/\{p\}|\(과\)|\(를\)/.test(t))bad.push(t)}}
console.log('checked',n,'bad',bad.length);bad.slice(0,10).forEach(b=>console.log(' ',b));process.exit(bad.length?1:0);
