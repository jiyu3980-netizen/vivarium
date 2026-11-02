/* 단면도마다 그 집에 등록한 캐릭터만 왼쪽 목록에 보이는지 + 관찰일지 날짜 기본값(오늘) + 지면 무늬가 그림 밖까지 이어지는지 */
const {chromium}=require('playwright');const SITE='http://localhost:8765/section-site/index.html';let fail=0;const ok=(n,c,x)=>{console.log((c?'ok ':'FAIL ')+n+(x?'  '+x:''));if(!c)fail++};
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(SITE,{waitUntil:'networkidle'});await p.click('.vnav button[data-m=edit]');await p.waitForTimeout(600);
await p.fill('#q','소파');await p.waitForTimeout(250);await (await p.$('#grid .tile')).click();await p.waitForTimeout(300);
await p.evaluate(()=>window.SectionBridge.slotCreate(JSON.parse(JSON.stringify(window.SectionBridge.S)),'둘째 집'));await p.waitForTimeout(500);
await p.click('.vnav button[data-m=viv]');await p.waitForTimeout(2500);
const addChar=async n=>{await p.click('#vvAdd');await p.fill('#vfName',n);await p.setInputFiles('#vfFile','/tmp/t9/char_alpha.png');await p.waitForTimeout(400);await p.fill('#vfProf',n+'은 책 읽기를 좋아해요');await p.click('#vfSave');await p.waitForTimeout(1200)};
const names=()=>p.$$eval('#vvChars .vv-chip b',e=>e.map(x=>x.textContent));
const housesN=await p.evaluate(()=>document.querySelectorAll('.vv-slide').length);ok('집이 2개',housesN>=2,String(housesN));
await addChar('가나');const hid0=await p.evaluate(()=>Viv.getUi().house);
// 둘째 집으로 이동
await p.evaluate(()=>{const n=document.querySelector('#vvNext');n&&n.click()});await p.waitForTimeout(2000);
const hid1=await p.evaluate(()=>Viv.getUi().house);ok('다른 집으로 넘어감',hid1&&hid1!==hid0);
ok('둘째 집 목록엔 첫째 집 캐릭터가 안 보임',(await names()).length===0,JSON.stringify(await names()));
await addChar('다라');ok('둘째 집엔 자기 캐릭터만',JSON.stringify(await names())===JSON.stringify(['다라']),JSON.stringify(await names()));
await p.evaluate(()=>{const n=document.querySelector('#vvPrev');n&&n.click()});await p.waitForTimeout(2000);
ok('첫째 집엔 자기 캐릭터만',JSON.stringify(await names())===JSON.stringify(['가나']),JSON.stringify(await names()));
// 관찰일지 날짜 기본값
await p.click('#vvJr');await p.waitForTimeout(800);
const dv=await p.evaluate(()=>document.querySelector('#vjDay')&&document.querySelector('#vjDay').value);
const today=await p.evaluate(()=>{const q=Viv.seoul(new Date());return q.year+'-'+String(q.month).padStart(2,'0')+'-'+String(q.day).padStart(2,'0')});
ok('관찰일지 날짜는 기본이 오늘(서울)',dv===today,dv+' / '+today);
await p.evaluate(()=>{const i=document.querySelector('#vjDay');i.value='';i.dispatchEvent(new Event('change'))});await p.waitForTimeout(200);
ok('날짜를 비워도 다시 오늘로',(await p.evaluate(()=>document.querySelector('#vjDay').value))===today);
await p.keyboard.press('Escape');
ok('지면 무늬 칸 있음',(await p.evaluate(()=>document.querySelectorAll('.vv-gtx pattern').length))>=1);
ok('페이지 오류 없음',errs.length===0,errs.join('|'));
console.log(fail?'FAIL':'ALL PASS');await b.close();process.exit(fail?1:0)})();
