const K=require(__dirname+'/../viv-ko.js');
const jong=n=>K.jong(n)>0,obj=n=>n+(jong(n)?'을':'를'),ga=n=>n+(jong(n)?'이':'가');
const OLD=(w,k)=>({a:`${obj(w)} 떠올리며 슬며시 미소를 지음`,b:`${w} 생각이 문득 스치는 듯함`,c:`거실에서 ${w}을(를) 즐기는 중`,d:`거실에서 ${w} 하며 여유를 즐기는 중`,e:`${ga(w)} 문득 떠올랐는지 인상을 살짝 찌푸림`})[k];
const rows=[['술 마시는 걸','b','feel'],['술 마시는 걸','c','act'],['술 마시는 걸','a','want'],['책 읽는 걸','b','want'],['책 읽는 걸','c','act'],['책 읽기','d','act'],['산책하기','c','act'],['산책하기','b','want'],['운동하는 것','d','act'],['운동하는 것','b','feel'],['혼자 있기','c','act'],['혼자 있는 걸','b','habit'],['밥 먹는 거','a','feel'],['빵 굽는 걸','c','act'],['노래 부르기','d','act'],['그림 그리기','b','feel'],['공부하기','c','act'],['청소하기','e','dis'],['벌레 보는 것','e','dis'],['식물 가꾸기','c','act'],['클래식 음악 듣는 걸','b','want'],['커피 마시는 걸','c','act'],['사진 찍기','b','habit'],['낚시','d','act']];
let n=0;for(const [w,o,k] of rows){const l=K.like(w);const nw=k==='dis'?K.dislike(w):l[k][0];console.log(`${++n}. 입력 "${w}"\n   전: ${OLD(w,o)}\n   후: ${(k==='act'?'거실에서 ':'')+nw}`)}
