const {chromium}=require('playwright');
const API='http://localhost:8787',SITE='http://localhost:8765/section-site/index.html';
const ok=(n,c,x)=>{console.log((c?'ok   ':'FAIL ')+n+(x?'  '+x:''));if(!c)process.exitCode=1};
async function mk(b,name){const ctx=await b.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(a=>{window.VIV_API=a},API);
  const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
  await p.goto(SITE,{waitUntil:'networkidle'});
  await p.click('.vnav button[data-m=edit]');await p.waitForTimeout(800);
  for(const q of ['소파','침대']){await p.fill('#q',q);await p.waitForTimeout(250);await (await p.$('#grid .tile')).click();await p.waitForTimeout(400)}
  await p.click('.vnav button[data-m=viv]');await p.waitForTimeout(2000);
  await p.click('#vvAdd');await p.fill('#vfName',name);await p.setInputFiles('#vfFile','/tmp/t9/char_alpha.png');await p.waitForTimeout(500);await p.fill('#vfProf',name+'은 책 읽기를 좋아해요');await p.click('#vfSave');await p.waitForTimeout(1200);
  await p.click('#vvShare');await p.waitForTimeout(300);await p.fill('#vsNick','주인'+name);await p.click('#vsGo');await p.waitForTimeout(2500);await p.keyboard.press('Escape');await p.waitForTimeout(300);
  return p}

async function joiner(b,code,name){const ctx=await b.newContext({viewport:{width:1400,height:900}});await ctx.addInitScript(a=>{window.VIV_API=a},API);const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
  await p.goto(SITE,{waitUntil:'networkidle'});await p.click('.vnav button[data-m=viv]');await p.waitForTimeout(1500);await p.click('#vvJoin');await p.waitForTimeout(300);await p.fill('#vjCode',code);await p.click('#vjGo');await p.waitForTimeout(3000);
  await p.keyboard.press('Escape');await p.waitForTimeout(500);
  await p.click('#vvAdd');await p.fill('#vfName',name);await p.setInputFiles('#vfFile','/tmp/t9/char_alpha.png');await p.waitForTimeout(500);await p.fill('#vfProf',name+'은 활발해요');await p.click('#vfSave');await p.waitForTimeout(2500);return p}
async function relView(p,me,other){await p.evaluate(n=>{const c=Viv.chars().find(x=>x.name===n);const li=document.querySelector('[data-id="'+c.id+'"]');li&&li.click()},me);await p.waitForTimeout(700);
  await p.evaluate(()=>{const t=[...document.querySelectorAll('.vv-detail button,.vv-dtabs button,button')].find(b=>/^관계$/.test(b.textContent.trim()));t&&t.click()});await p.waitForTimeout(700);
  await p.evaluate(o=>{const c=Viv.chars().find(x=>x.name===o);const b=document.querySelector('.vm-rel[data-o="'+c.id+'"]');b&&b.click()},other);await p.waitForTimeout(800);
  return p.evaluate(()=>{const s=document.querySelector('#vmRom');return s?{val:s.value,txt:s.selectedOptions[0]&&s.selectedOptions[0].textContent.slice(0,40),disabled:s.disabled,lock:!!document.querySelector('.vm-lock')}:null})}
(async()=>{const b=await chromium.launch();
 const A=await mk(b,'보리');const hid=await A.evaluate(()=>Object.keys(VivShare.reg().houses)[0]);const code=await A.evaluate(h=>VivShare.reg().houses[h].code,hid);console.log('code',code);
 const B=await joiner(b,code,'하루');
 await A.waitForTimeout(4000);
 console.log('A chars',await A.evaluate(()=>Viv.chars().map(c=>c.name)),'B chars',await B.evaluate(()=>Viv.chars().map(c=>c.name)));
 const before=await relView(A,'보리','하루');console.log('A 관계탭(설정 전)',JSON.stringify(before));
 if(before){await A.selectOption('#vmRom','crush_c');await A.waitForTimeout(2500);}
 console.log('A 설정 후',JSON.stringify(await relView(A,'보리','하루')));
 await B.waitForTimeout(6000);
 console.log('B 하루→보리 관계탭',JSON.stringify(await relView(B,'하루','보리')));
 console.log('B 보리→하루 관계탭',JSON.stringify(await relView(B,'보리','하루')));
 /* B 가 바꿔 보기 */
 const bsel=await B.$('#vmRom');if(bsel&&!(await bsel.isDisabled())){await B.selectOption('#vmRom','none');await B.waitForTimeout(2500);console.log('B 가 바꿈 시도 → 서버 반영 확인')}
 const hh=await B.evaluate(()=>Object.keys(VivShare.reg().houses)[0]);const ids=await B.evaluate(()=>Object.fromEntries(Viv.chars().map(c=>[c.name,c.id])));
 const rj=await B.evaluate(async([h,a,b2])=>{const r=await VivShare.mindRel(h,{a,b:b2,rel:{},rom:{},clearRom:true});return r},[hh,ids['하루'],ids['보리']]);console.log('B 가 서버에 직접 변경 요청 →',JSON.stringify(rj));
 await A.waitForTimeout(8000);console.log('A 최종',JSON.stringify(await relView(A,'보리','하루')));
 console.log('errs',A.errs.slice(0,3),B.errs.slice(0,3));await b.close()})();
