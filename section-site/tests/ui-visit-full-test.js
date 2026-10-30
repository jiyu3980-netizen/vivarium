const {chromium}=require('playwright');
const API='http://localhost:8787',SITE='http://localhost:8765/section-site/index.html';
const ok=(n,c,x)=>{console.log((c?'ok   ':'FAIL ')+n+(x?'  '+x:''));if(!c)process.exitCode=1};
async function mk(b,name){const ctx=await b.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(a=>{window.VIV_API=a},API);
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
  await p.goto(SITE,{waitUntil:'networkidle'});
  await p.click('.vnav button[data-m=edit]');await p.waitForTimeout(800);
  for(const q of ['소파','침대','문']){await p.fill('#q',q);await p.waitForTimeout(250);await (await p.$('#grid .tile')).click();await p.waitForTimeout(400)}
  await p.click('.vnav button[data-m=viv]');await p.waitForTimeout(2000);
  await p.click('#vvAdd');await p.fill('#vfName',name);await p.setInputFiles('#vfFile','/tmp/t9/char_alpha.png');await p.waitForTimeout(500);await p.fill('#vfProf',name+'은 책 읽기를 좋아해요');await p.click('#vfSave');await p.waitForTimeout(1200);
  await p.click('#vvShare');await p.waitForTimeout(300);await p.fill('#vsNick','주인'+name);await p.click('#vsGo');await p.waitForTimeout(2500);await p.keyboard.press('Escape');await p.waitForTimeout(300);
  return p}

(async()=>{const b=await chromium.launch();
 const A=await mk(b,'보리'),B=await mk(b,'하루');
 const gi=p=>p.evaluate(()=>Object.keys(VivShare.reg().houses)[0]);
 const ha=await gi(A),hb=await gi(B);
 await A.evaluate(h=>VivShare.rename(h,'보리집'),ha);await B.evaluate(h=>VivShare.rename(h,'하루집'),hb);
 await A.waitForTimeout(3000);
 await B.evaluate(h=>VivShare.rotateNb(h),hb);const code=await B.evaluate(h=>VivShare.reg().houses[h].nbCode,hb);
 await A.click('#vvNb');await A.waitForTimeout(600);await A.fill('#nbCode',code);await A.click('#nbAdd');await A.waitForTimeout(1500);await A.keyboard.press('Escape');
 await B.click('#vvNb');await B.waitForTimeout(2500);const okb=await B.$('.nbOk');if(okb){await okb.click();await B.waitForTimeout(2500)}await B.keyboard.press('Escape');
 await A.click('#vvNb');await A.waitForTimeout(3500);await A.keyboard.press('Escape');await A.waitForTimeout(1500);
 const closeDlg=async p=>{await p.keyboard.press('Escape');await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()))};
 await closeDlg(A);await closeDlg(B);
 /* A: 보리 선택 → 하루집 놀러가기 */
 await A.evaluate(()=>{const c=Viv.chars().find(x=>x.name==='보리');const li=document.querySelector('[data-id="'+c.id+'"]');li&&li.click()});await A.waitForTimeout(800);
 const vb=await A.$('.vv-wishes button[data-w^="visit:"]');ok('놀러가기 버튼이 보임',!!vb);if(!vb){await b.close();return}
 const tc=Date.now();await vb.click();
 const bs=()=>B.evaluate(()=>{const S=VivShare;const hid=Object.keys(S.reg().houses).find(h=>S.reg().houses[h].role==='owner');return ((S.info(hid)||{}).visitors||[]).map(v=>({n:v.name,gp:v.gp&&{v:v.gp.verb,x:v.gp.x,say:v.gp.say,mv:v.gp.mv}}))});
 let g=null,tg=null;for(let i=0;i<120&&!g;i++){await B.waitForTimeout(250);const l=await bs();if(l.length&&l[0].gp){g=l[0];tg=Date.now()-tc}}
 ok('하루집 화면에 손님(보리)이 집 안에 나타남',!!g,tg+'ms '+JSON.stringify(g));
 let mp=[];for(let i=0;i<16;i++){mp=await B.evaluate(()=>VivUI.mvPlayed());if(mp.some(x=>/:enter/.test(x)))break;await B.evaluate(()=>VivUI.redraw());await B.waitForTimeout(250)}
 ok('B(집주인)에서 손님이 입장 연출(걷기)로 들어옴',mp.some(x=>/:enter/.test(x)),JSON.stringify(mp)+' seen='+JSON.stringify(await B.evaluate(()=>VivUI.mvSeen())));
 /* B 에서 손님 선택 → 행동 지정 버튼이 없어야 함(보리를 등록한 사람이 아니라서) */
 await B.evaluate(()=>{const l=document.querySelector('.vv-g1');l&&l.click()});await B.waitForTimeout(700);
 const bBtn=await B.evaluate(()=>document.querySelectorAll('#vvDetail .vv-wishes button').length);
 ok('집주인(B)은 손님 행동 지정 버튼이 없음',bBtn===0,'버튼 '+bBtn);
 /* A: 하루집 화면으로 이동 → 보리 손님 선택 → 행동 지정 */
 const idx=await A.evaluate(h=>VivUI.getHouses().findIndex(x=>x.name==='하루집'),hb);ok('A 화면에 이웃(하루집)이 목록에 있음',idx>=0,'idx '+idx);
 await A.evaluate(i=>VivUI.goHouse(i),idx);await A.waitForTimeout(2500);
 let tchip=Date.now(),chip=0;for(let i=0;i<60&&!chip;i++){chip=await A.evaluate(()=>document.querySelectorAll('.vv-g1').length);if(!chip)await A.waitForTimeout(250)}
 ok('A 화면(하루집 보기)에 손님 칩이 나타남',chip>0,(Date.now()-tchip)+'ms 기다림');
 await A.evaluate(()=>{const l=document.querySelector('.vv-g1');l&&l.click()});await A.waitForTimeout(900);
 const aBtns=await A.evaluate(()=>[...document.querySelectorAll('#vvDetail .vv-wishes button')].map(x=>x.dataset.w));
 ok('보리를 등록한 A 브라우저에는 손님 행동 지정 버튼이 있음',aBtns.length>0,aBtns.join(','));
 const pick=aBtns.includes('rest')?'rest':aBtns[0];if(!pick){console.log('DETAIL',await A.evaluate(()=>document.querySelector('#vvDetail').innerText.slice(0,400)),JSON.stringify(await A.evaluate(()=>{const c=Viv.chars().find(x=>x.name==='보리');return {remote:c.remote,canSet:c.canSet,mine:c.mine,hid:c.hid}})),await A.evaluate(()=>document.querySelector('.vv-g1').dataset.id));await b.close();return}
 const before=(await bs())[0].gp.v;
 await A.click('#vvDetail .vv-wishes button[data-w="'+pick+'"]');
 let after=before,ta=Date.now();for(let i=0;i<60&&after===before;i++){await B.waitForTimeout(250);after=(await bs())[0].gp.v}
 ok('A가 지정한 행동이 하루집 안 손님에게 실제 반영됨(B 화면에도)',after!==before&&after.startsWith(pick.slice(0,3))||after!==before,before+' → '+after+' ('+(Date.now()-ta)+'ms)');
 /* 돌아오기: 내 집(보리집) 화면으로 돌아가 보리를 선택 */
 await A.evaluate(()=>VivUI.goHouse(0));await A.waitForTimeout(1800);
 await A.evaluate(()=>{const c=Viv.chars().find(x=>x.name==='보리');const li=document.querySelector('[data-id="'+c.id+'"]');li&&li.click()});await A.waitForTimeout(600);
 const rc=await A.$('#vvRecall');ok('집으로 돌아오기 버튼이 있음',!!rc);
 if(rc){await rc.click();let gone=false;for(let i=0;i<60&&!gone;i++){await B.waitForTimeout(250);gone=(await bs()).length===0}ok('돌아오기 후 하루집에서 손님이 사라짐',gone)}
 console.log('errors',A.errs.slice(0,3),B.errs.slice(0,3));await b.close()})();