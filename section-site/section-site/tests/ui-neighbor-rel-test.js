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

 const sql=q=>JSON.parse(require('child_process').execFileSync('python3',['-c',`import sqlite3,glob,json,sys\nc=sqlite3.connect(glob.glob('/tmp/srv/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite')[0])\nr=c.execute(sys.argv[1]).fetchall()\nc.commit()\nprint(json.dumps(r))`,q]).toString());
 const idOf=(p,n)=>p.evaluate(n=>Viv.chars().find(x=>x.name===n).id,n);
 const bori=await idOf(A,'보리'),haru=await idOf(A,'하루');
 /* 서버 쪽 B 집 기록에 '보리가 놀러 가서 하루와 쌓은 관계'를 넣어 둔다(실제로는 서버 엔진이 방문 중 만든다) */
 const now=Date.now();const doc={v:1,emo:{},rel:{},th:{},mem:{},seen:[],last:{},rom:{},rev:{}};
 doc.rel[bori+'>'+haru]={type:'friend',aff:42,last:now,why:'하루와 함께 식사했어요',whyAt:now,lock:null,origin:''};
 doc.rel[haru+'>'+bori]={type:'friend',aff:38,last:now,why:'보리와 이야기를 나눴어요',whyAt:now,lock:null,origin:''};
 const esc=x=>x.replace(/'/g,"''");
 sql(`insert or replace into mind_docs(house_id,rev,data,updated_at) values('${hb}',5,'${esc(JSON.stringify(doc))}',${now})`);
 const show=async(p,me,other)=>{await p.evaluate(n=>{const c=Viv.chars().find(x=>x.name===n);const li=document.querySelector('[data-id="'+c.id+'"]');li&&li.click()},me);await p.waitForTimeout(600);
  await p.evaluate(()=>{const t=[...document.querySelectorAll('button')].find(b=>/^관계$/.test(b.textContent.trim()));t&&t.click()});await p.waitForTimeout(2500);
  const list=await p.evaluate(()=>[...document.querySelectorAll('.vm-rel')].map(b=>b.textContent.replace(/\s+/g,' ').trim().slice(0,70)));
  const sel=await p.evaluate(o=>{const c=Viv.chars().find(x=>x.name===o);const b=document.querySelector('.vm-rel[data-o="'+c.id+'"]');b&&b.click();return !!b},other);await p.waitForTimeout(800);
  const dis=await p.evaluate(()=>({aff:document.querySelector('#vmAff')&&document.querySelector('#vmAff').disabled,lock:(document.querySelector('.vm-lock')||{}).textContent}));return {list,dis}};
 console.log('A(보리) 관계탭',JSON.stringify(await show(A,'보리','하루')));
 console.log('B(하루) 관계탭',JSON.stringify(await show(B,'하루','보리')));
 console.log('errors A',A.errs.slice(0,3),'B',B.errs.slice(0,3));await b.close()})();
