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
 const gi=p=>p.evaluate(()=>{const hid=Object.keys(VivShare.reg().houses)[0];return hid});
 const ha=await gi(A),hb=await gi(B);
 await A.evaluate(h=>VivShare.rename(h,'보리집'),ha);await B.evaluate(h=>VivShare.rename(h,'하루집'),hb);
 await A.waitForTimeout(3000);
 await B.evaluate(h=>VivShare.rotateNb(h),hb);const code=await B.evaluate(h=>VivShare.reg().houses[h].nbCode,hb);
 await A.click('#vvNb');await A.waitForTimeout(600);await A.fill('#nbCode',code);await A.click('#nbAdd');await A.waitForTimeout(1500);await A.keyboard.press('Escape');
 await B.click('#vvNb');await B.waitForTimeout(2500);const okb=await B.$('.nbOk');if(okb){await okb.click();await B.waitForTimeout(2500)}await B.keyboard.press('Escape');
 await A.click('#vvNb');await A.waitForTimeout(3500);await A.keyboard.press('Escape');await A.waitForTimeout(1500);
 const st=()=>A.evaluate(()=>{const c=Viv.chars().find(x=>x.name==='보리'),p=Viv.getPlace(c.id),s=Viv.getSim(c.id);return {mode:p.mode,verb:p.verb,house:p.house,say:p.say,wish:s.wish&&s.wish.k,outTo:s.outTo}});
 console.log('before',JSON.stringify(await st()));
 /* 보리 선택 → 상세 → 놀러가기 */
 await A.evaluate(()=>{const c=Viv.chars().find(x=>x.name==='보리');const li=document.querySelector('[data-id="'+c.id+'"]');li&&li.click()});await A.waitForTimeout(800);
 const btns=await A.evaluate(()=>[...document.querySelectorAll('.vv-wishes button')].map(b=>b.dataset.w+':'+b.textContent.trim()));console.log('wish buttons',JSON.stringify(btns));
 const vb=await A.$('.vv-wishes button[data-w^="visit:"]');console.log('visit button',!!vb);
 if(vb){await vb.click();await A.waitForTimeout(500);console.log('msg',await A.evaluate(()=>{const m=document.querySelector('#vvWmsg');return m&&m.textContent}))}
 const t0=Date.now();let tOut=null;
 for(let i=0;i<80&&tOut===null;i++){await A.waitForTimeout(250);const x=await st();if(x.mode==='out')tOut=Date.now()-t0}
 console.log('방문 버튼 → 외출 반영까지(ms)',tOut);
 await A.waitForTimeout(3000);
 await A.evaluate(()=>{const c=Viv.chars().find(x=>x.name==='보리');const li=document.querySelector('[data-id="'+c.id+'"]');li&&li.click()});await A.waitForTimeout(600);
 const rc=await A.$('#vvRecall');console.log('recall button',!!rc);
 const t1=Date.now();let tHome=null;if(rc){await rc.click();for(let i=0;i<120&&tHome===null;i++){await A.waitForTimeout(250);const x=await st();if(x.mode==='home')tHome=Date.now()-t1}}
 console.log('귀가 버튼 → 집 복귀 반영까지(ms)',tHome,JSON.stringify(await st()));
 await B.waitForTimeout(6000);console.log('B guest chips',await B.evaluate(()=>document.querySelectorAll('.vv-g1').length),'B visitors api',await B.evaluate(async()=>{const S=VivShare;const hid=Object.keys(S.reg().houses).find(h=>S.reg().houses[h].role==='owner');const i=S.info(hid);return JSON.stringify((i.visitors||[]).map(v=>v.name+':'+v.say))}));console.log('A out chips',await A.evaluate(()=>document.querySelectorAll('.vv-out1').length));await A.screenshot({path:'/tmp/eng/vA.png'});await B.screenshot({path:'/tmp/eng/vB.png'});
 console.log('errors A',A.errs.slice(0,4),'B',B.errs.slice(0,4));await b.close()})();
