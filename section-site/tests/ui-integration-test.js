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
(async()=>{const b=await chromium.launch();
 const A=await mk(b,'보리'),B=await mk(b,'하루');
 const info=p=>p.evaluate(()=>{const S=VivShare,r=S.reg().houses,hid=Object.keys(r)[0],i=S.info(hid);return {hid,role:r[hid].role,engine:S.engineOn(hid),chars:Viv.chars().map(c=>({id:c.id,name:c.name,remote:!!c.remote,mine:!!c.mine,hid:c.hid}))}});
 const ia=await info(A),ib=await info(B);ok('A 공유 집 생성',!!ia.hid&&ia.role==='owner',JSON.stringify(ia).slice(0,120));ok('B 공유 집 생성',!!ib.hid);
 ok('A 캐릭터가 서버로 옮겨짐',ia.chars.some(c=>c.remote&&c.mine&&c.name==='보리'));
 /* 서버가 도면(geo)을 받아 서버 계산이 켜지는지 */
 await A.waitForTimeout(4000);await B.waitForTimeout(1000);
 const ea=await A.evaluate(h=>VivShare.engineOn(h),ia.hid),eb=await B.evaluate(h=>VivShare.engineOn(h),ib.hid);
 ok('서버 계산 켜짐(화면→서버 도면 업로드 후)',ea&&eb,`A=${ea} B=${eb}`);
 const hdr=await A.evaluate(()=>localStorage.getItem('viv_ident')); ok('X-Ident 비밀값 생성',hdr&&hdr.length>=32);
 /* 서버 일지 API를 화면 클라이언트로 호출 */
 const j=await A.evaluate(async h=>{try{const r=await VivShare.journal(h,{limit:5});return {ok:1,n:(r.days||[]).length}}catch(e){return {err:e.message}}},ia.hid);ok('화면 클라이언트가 서버 일지 조회',!!j.ok,JSON.stringify(j));
 /* 이웃 연결: B 이웃코드 → A 신청(화면) → B 수락(화면) */
 await B.evaluate(h=>VivShare.rotateNb(h),ib.hid);const code=await B.evaluate(h=>VivShare.reg().houses[h].nbCode,ib.hid);ok('B 이웃 코드',!!code,code);
 await A.click('#vvNb');await A.waitForTimeout(600);await A.fill('#nbCode',code);await A.click('#nbAdd');await A.waitForTimeout(1500);
 await A.keyboard.press('Escape');
 await B.click('#vvNb');await B.waitForTimeout(2500);
 const okBtn=await B.$('.nbOk');ok('B 에 받은 이웃 신청 표시',!!okBtn);if(okBtn){await okBtn.click();await B.waitForTimeout(2500)}
 await B.keyboard.press('Escape');await A.click('#vvNb');await A.waitForTimeout(3000);
 const txtA=await A.evaluate(()=>[...document.querySelectorAll('dialog')].filter(d=>d.open).map(d=>d.innerText).join('|'));
 ok('A 에 이웃 연결 표시',/연결된 이웃/.test(txtA));
 /* 이사 제안: A 의 보리 → B 집 */
 ok('A 이웃하기 창에 「이사 제안 보내기」 표시',/이사 제안 보내기/.test(txtA));
 await A.screenshot({path:'/tmp/eng/mv1.png'});
 const hasSel=await A.$('#mvC');if(hasSel){await A.click('#mvGo');await A.waitForTimeout(2000)}
 await A.keyboard.press('Escape');
 await B.click('#vvNb');await B.waitForTimeout(3000);
 const txtB=await B.evaluate(()=>[...document.querySelectorAll('dialog')].filter(d=>d.open).map(d=>d.innerText).join('|'));
 ok('B 에 받은 이사 제안(수락 버튼) 표시',!!(await B.$('.mvOk')),txtB.replace(/\n/g,' / ').slice(-160));
 /* 이웃(B)이 A 집 정보를 어디까지 보는지 */
 const priv=await B.evaluate(async h=>{const S=VivShare,o={};const role=S.reg().houses[h]&&S.reg().houses[h].role;o.role=role;for(const [k,p] of [['moves','/move-offers'],['mind','/mind'],['journal','/journal?limit=5']]){try{const r=await S.api('GET','/api/houses/'+h+p,{hid:h});o[k]=JSON.stringify(r).slice(0,90)}catch(e){o[k]='ERR '+e.status}}return o},ia.hid);
 console.log('B→A 집 접근',JSON.stringify(priv));ok('이웃은 A 의 이사 제안을 못 봄',/"offers":\[\]/.test(priv.moves)||/ERR/.test(priv.moves),priv.moves);ok('이웃은 A 의 일지를 못 봄',/"days":\[\]/.test(priv.journal)&&/"chars":\[\]/.test(priv.journal),priv.journal);ok('이웃은 A 의 마음(감정·관계)을 못 봄',!/"emo"|"rel"/.test(priv.mind||''),priv.mind);
 /* 수락 전: 아무 일도 없어야 함 */
 const before=await A.evaluate(()=>Viv.chars().filter(c=>c.name==='보리').map(c=>c.hid));ok('수락 전에는 보리가 원래 집에 그대로',before.length===1&&before[0]===ia.hid,JSON.stringify(before));
 const nOff=(await B.evaluate(()=>[...document.querySelectorAll('#nbMoves li')].length));ok('B 화면에 제안 1건만 표시(중복 없음)',nOff===1,String(nOff));
 const mvOk=await B.$('.mvOk');if(mvOk){await mvOk.click();await B.waitForTimeout(2500)}
 await B.keyboard.press('Escape');
 await A.click('#vvNb');await A.waitForTimeout(3500);
 const cl=await A.$('.mvCl');ok('A 에 「새 집 받기」 표시',!!cl);if(cl){await cl.click();await A.waitForTimeout(3000)}
 const after=await A.evaluate(()=>({houses:Object.keys(VivShare.reg().houses),chars:Viv.chars().map(c=>({n:c.name,hid:c.hid}))}));
 ok('A 가 B 집 입장 정보를 받음',after.houses.includes(ib.hid),JSON.stringify(after).slice(0,200));
 ok('보리가 B 집 소속이 됨',after.chars.some(c=>c.n==='보리'&&c.hid===ib.hid));
 await A.screenshot({path:'/tmp/eng/mv2.png'});
 console.log('page errors A',A.errs.slice(0,4),'B',B.errs.slice(0,4));await b.close()})();
