// DWG → 뷰별 SVG 추출기 (libredwg-web 사용, 원본 DWG는 읽기만 함)
// usage: node extract.mjs <srcDir> <outDir> [fileFilterRegex]
import {LibreDwg,Dwg_File_Type} from '@mlightcad/libredwg-web';
import fs from 'fs';import path from 'path';
const [,,SRC,OUT,FILTER]=process.argv;
const lib=await LibreDwg.create();
const UNIT_CM={1:2.54,2:30.48,4:0.1,5:1,6:100,7:100000,8:2.54e-6,10:91.44,14:10,15:100,16:10000};
const EXCL_TYPE=new Set(['TEXT','MTEXT','DIMENSION','MULTILEADER','LEADER','ATTDEF','ATTRIB','VIEWPORT','WIPEOUT','POINT','TOLERANCE']);
const EXCL_LAYER=/dim|defpoints|anno|title|border|frame|logo|^text/i;
const I=[1,0,0,1,0,0];
const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
const ap=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const simil=m=>{const sx=Math.hypot(m[0],m[1]),sy=Math.hypot(m[2],m[3]);return Math.abs(sx-sy)<1e-6*Math.max(sx,1e-9)&&Math.abs(m[0]*m[2]+m[1]*m[3])<1e-6*sx*sy?sx:0};
function code(name){const n=name.trim().toLowerCase();
  let m=n.match(/(plan|pl|fr|front|rs|ls|bk|back|ct|cut|sect|section)(\d*)$/);
  if(m){const k=m[1];if(!m[2]){const pm=n.slice(0,m.index).match(/(\d+)$/);if(pm)m[2]=pm[1]}const kind=/^(plan|pl)$/.test(k)?'top':/^(fr|front)$/.test(k)?'front':k==='rs'?'rightSide':k==='ls'?'leftSide':/^(bk|back)$/.test(k)?'back':'section';return {kind,v:m[2],conf:'name'}}
  m=n.match(/\d{2,}([pes])$/);if(m)return {kind:m[1]==='p'?'top':m[1]==='e'?'front':'rightSide',v:n,conf:'catalog-code'};
  return null}
function arcPts(cx,cy,r,a0,a1,m,n=48){const out=[];let d=a1-a0;while(d<=0)d+=2*Math.PI;const k=Math.max(8,Math.ceil(n*d/(2*Math.PI)));for(let i=0;i<=k;i++){const a=a0+d*i/k;out.push(ap(m,cx+r*Math.cos(a),cy+r*Math.sin(a)))}return out}
function bulgeSeg(p,q,b,m){ // → segment descriptor in world coords
  const [x1,y1]=ap(m,p.x,p.y),[x2,y2]=ap(m,q.x,q.y);
  if(!b||Math.abs(b)<1e-9)return {t:'L',x1,y1,x2,y2};
  const s=simil(m);const c=Math.hypot(q.x-p.x,q.y-p.y);if(!s||c<1e-12)return {t:'L',x1,y1,x2,y2};
  const sag=Math.abs(b)*c/2;const r=(c*c/4+sag*sag)/(2*sag);const det=m[0]*m[3]-m[1]*m[2];
  const large=Math.abs(b)>1?1:0;let sweep=b>0?1:0;if(det<0)sweep=1-sweep;
  // SVG y is flipped later; keep CCW-in-world semantic and flip at output
  return {t:'A',x1,y1,x2,y2,r:r*s,large,sweep};}
const bb=()=>({x0:1e30,y0:1e30,x1:-1e30,y1:-1e30});
const grow=(b,x,y)=>{if(x<b.x0)b.x0=x;if(x>b.x1)b.x1=x;if(y<b.y0)b.y0=y;if(y>b.y1)b.y1=y};

function collect(ents,blocks,m,acc,depth){
 for(const e of ents){
  if(EXCL_TYPE.has(e.type)){acc.excl[e.type]=(acc.excl[e.type]||0)+1;continue}
  if(e.layer&&EXCL_LAYER.test(e.layer)&&e.type!=='INSERT'){acc.excl['layer:'+e.layer]=(acc.excl['layer:'+e.layer]||0)+1;continue}
  switch(e.type){
  case 'LINE':acc.segs.push({t:'L',...(([a,b])=>({x1:a,y1:b}))(ap(m,e.startPoint.x,e.startPoint.y)),...(([a,b])=>({x2:a,y2:b}))(ap(m,e.endPoint.x,e.endPoint.y))});break;
  case 'ARC':{const s=simil(m);const det=m[0]*m[3]-m[1]*m[2];
    if(s){let a0=e.startAngle,a1=e.endAngle;const rot=Math.atan2(m[1],m[0]);
      const [x1,y1]=ap(m,e.center.x+e.radius*Math.cos(a0),e.center.y+e.radius*Math.sin(a0));
      const [x2,y2]=ap(m,e.center.x+e.radius*Math.cos(a1),e.center.y+e.radius*Math.sin(a1));
      let d=a1-a0;while(d<=0)d+=2*Math.PI;
      acc.segs.push({t:'A',x1,y1,x2,y2,r:e.radius*s,large:d>Math.PI?1:0,sweep:det>0?1:0,cx:ap(m,e.center.x,e.center.y)[0],cy:ap(m,e.center.x,e.center.y)[1],a0,a1,det});
    }else{const p=arcPts(e.center.x,e.center.y,e.radius,e.startAngle,e.endAngle,m);for(let i=0;i<p.length-1;i++)acc.segs.push({t:'L',x1:p[i][0],y1:p[i][1],x2:p[i+1][0],y2:p[i+1][1]});acc.note.add('arc-sampled')}
    break}
  case 'CIRCLE':{const s=simil(m);const [cx,cy]=ap(m,e.center.x,e.center.y);
    if(s){const r=e.radius*s;acc.segs.push({t:'C',cx,cy,r})}else{const p=arcPts(e.center.x,e.center.y,e.radius,0,2*Math.PI,m);for(let i=0;i<p.length-1;i++)acc.segs.push({t:'L',x1:p[i][0],y1:p[i][1],x2:p[i+1][0],y2:p[i+1][1]});acc.note.add('circle-sampled')}
    break}
  case 'ELLIPSE':{const [mx,my]=[e.majorAxisEndPoint.x,e.majorAxisEndPoint.y];const a=Math.hypot(mx,my),b=a*e.axisRatio,rot=Math.atan2(my,mx);
    let a0=e.startAngle||0,a1=e.endAngle??2*Math.PI;if(Math.abs(a1-a0)<1e-9)a1=a0+2*Math.PI;let d=a1-a0;while(d<=0)d+=2*Math.PI;const k=Math.max(24,Math.ceil(96*d/(2*Math.PI)));
    let prev=null;for(let i=0;i<=k;i++){const t=a0+d*i/k;const lx=a*Math.cos(t),ly=b*Math.sin(t);const p=ap(m,e.center.x+lx*Math.cos(rot)-ly*Math.sin(rot),e.center.y+lx*Math.sin(rot)+ly*Math.cos(rot));if(prev)acc.segs.push({t:'L',x1:prev[0],y1:prev[1],x2:p[0],y2:p[1]});prev=p}
    acc.note.add('ellipse-sampled');break}
  case 'LWPOLYLINE':{const v=e.vertices||[];const n=v.length;const cl=(e.flag&1)===1||(e.flag&512)===512; // libredwg: 512 = closed
    for(let i=0;i<(cl?n:n-1);i++){acc.segs.push(bulgeSeg(v[i],v[(i+1)%n],v[i].bulge,m))}break}
  case 'POLYLINE2D':{let v=e.vertices||[];const spl=(e.smoothType===5||e.smoothType===6);if(spl)v=v.filter(x=>!(x.flag&16));
    const n=v.length;const cl=(e.flag&1)===1;for(let i=0;i<(cl?n:n-1);i++){acc.segs.push(bulgeSeg(v[i],v[(i+1)%n],spl?0:v[i].bulge,m))}break}
  case 'SPLINE':{const cp=e.controlPoints||[],fp=e.fitPoints||[];let pts=[];
    if(cp.length>=2&&e.knots&&e.knots.length){const p=e.degree||3,kn=e.knots,n=cp.length;const t0=kn[p],t1=kn[n];const N=Math.max(24,(n-p)*16);
      for(let i=0;i<=N;i++){const t=i===N?t1-1e-9:t0+(t1-t0)*i/N;let k=p;while(k<n-1&&t>=kn[k+1])k++;const d=[];for(let j=0;j<=p;j++)d.push({x:cp[j+k-p].x,y:cp[j+k-p].y});
        for(let r=1;r<=p;r++)for(let j=p;j>=r;j--){const al=(t-kn[j+k-p])/(kn[j+1+k-r]-kn[j+k-p]||1);d[j]={x:(1-al)*d[j-1].x+al*d[j].x,y:(1-al)*d[j-1].y+al*d[j].y}}
        pts.push(d[p])}}
    else pts=fp;
    for(let i=0;i<pts.length-1;i++){const a=ap(m,pts[i].x,pts[i].y),b=ap(m,pts[i+1].x,pts[i+1].y);acc.segs.push({t:'L',x1:a[0],y1:a[1],x2:b[0],y2:b[1]})}
    acc.note.add('spline-sampled');break}
  case 'SOLID':{const c=[e.corner1,e.corner2,e.corner4||e.corner3,e.corner3].map(p=>ap(m,p.x,p.y));acc.fills.push(c);break}
  case 'HATCH':acc.excl.HATCH=(acc.excl.HATCH||0)+1;break;
  case 'INSERT':{if(depth>6)break;const b=blocks[e.name];if(!b)break;const bp=b.basePoint||{x:0,y:0};
    const c=Math.cos(e.rotation||0),s=Math.sin(e.rotation||0);const xs=e.xScale||1,ys=e.yScale||1;
    const mi=mul(m,[xs*c,xs*s,-ys*s,ys*c,e.insertionPoint.x,e.insertionPoint.y]);
    collect(b.entities||[],blocks,mul(mi,[1,0,0,1,-bp.x,-bp.y]),acc,depth+1);break}
  default:acc.excl['other:'+e.type]=(acc.excl['other:'+e.type]||0)+1}
 }}
function chain(segs){ // 끝점이 일치하는 LINE을 하나의 polyline으로 이음 (기하 불변)
  const K=v=>Math.round(v*1000);const key=(x,y)=>K(x)+','+K(y);
  const lines=[],other=[];for(const s of segs)(s.t==='L'?lines:other).push(s);
  const map=new Map();lines.forEach((s,i)=>{for(const [x,y] of [[s.x1,s.y1],[s.x2,s.y2]]){const k=key(x,y);(map.get(k)||map.set(k,[]).get(k)).push(i)}});
  const used=new Uint8Array(lines.length);const polys=[];
  const next=(x,y)=>{const a=map.get(key(x,y));if(!a)return -1;for(const i of a)if(!used[i])return i;return -1};
  for(let i=0;i<lines.length;i++){if(used[i])continue;used[i]=1;const pts=[[lines[i].x1,lines[i].y1],[lines[i].x2,lines[i].y2]];
    for(let dir=0;dir<2;dir++){for(;;){const [x,y]=pts[pts.length-1];const j=next(x,y);if(j<0)break;used[j]=1;const L=lines[j];if(key(L.x1,L.y1)===key(x,y))pts.push([L.x2,L.y2]);else pts.push([L.x1,L.y1])}
      pts.reverse()}
    polys.push(pts)}
  return {polys,other}}
function renderSVG(acc,opts){
  const B=bb();const g=(x,y)=>grow(B,x,y);
  for(const s of acc.segs){if(s.t==='C'){g(s.cx-s.r,s.cy-s.r);g(s.cx+s.r,s.cy+s.r)}else{g(s.x1,s.y1);g(s.x2,s.y2);if(s.t==='A'){ // 호의 극점 포함
      const a0=s.a0,a1=s.a1;if(s.cx!==undefined){let d=a1-a0;while(d<=0)d+=2*Math.PI;for(let q=0;q<4;q++){let a=q*Math.PI/2;let t=a-a0;while(t<0)t+=2*Math.PI;if(t<=d)g(s.cx+s.r*Math.cos(a),s.cy+s.r*Math.sin(a))}}else{const mx=(s.x1+s.x2)/2,my=(s.y1+s.y2)/2;g(mx,my)}}}}
  for(const f of acc.fills)for(const [x,y] of f)g(x,y);
  if(B.x1<B.x0)return null;
  const W=B.x1-B.x0,H=B.y1-B.y0;const sc=1000/Math.max(W,H,1e-9);const f=v=>+(v).toFixed(2);
  const X=x=>f((x-B.x0)*sc),Y=y=>f((B.y1-y)*sc);
  const {polys,other}=chain(acc.segs);let d='';
  for(const p of polys){d+='M'+p.map(([x,y])=>X(x)+' '+Y(y)).join('L')}
  for(const s of other){if(s.t==='C'){const r=f(s.r*sc);d+=`M${X(s.cx-s.r)} ${Y(s.cy)}a${r} ${r} 0 1 0 ${f(2*s.r*sc)} 0a${r} ${r} 0 1 0 ${f(-2*s.r*sc)} 0`}
    else if(s.t==='A'){const r=f(s.r*sc);d+=`M${X(s.x1)} ${Y(s.y1)}A${r} ${r} 0 ${s.large} ${s.sweep?0:1} ${X(s.x2)} ${Y(s.y2)}`}}
  let fl='';for(const c of acc.fills)fl+='M'+c.map(([x,y])=>X(x)+' '+Y(y)).join('L')+'Z';
  const w=f(W*sc),h=f(H*sc);const vb=`0 0 ${w} ${h}`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}"><g fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"><path vector-effect="non-scaling-stroke" d="${d}"/></g>${fl?`<path fill="#222" stroke="none" d="${fl}"/>`:''}</svg>\n`;
  // 이상 징후: 전체 bbox 대비 강건 bbox
  const mids=acc.segs.filter(s=>s.t!=='C').map(s=>[(s.x1+s.x2)/2,(s.y1+s.y2)/2]);let robust=null;
  if(mids.length>20){const xs=mids.map(p=>p[0]).sort((a,b)=>a-b),ys=mids.map(p=>p[1]).sort((a,b)=>a-b);const q=(a,p)=>a[Math.min(a.length-1,Math.max(0,Math.floor(p*(a.length-1))))];
    robust={w:q(xs,.99)-q(xs,.01),h:q(ys,.99)-q(ys,.01)}}
  // 투영 공백 분석(여러 개체 포함 여부)
  let gaps=0;if(acc.segs.length>30){const xs=acc.segs.filter(s=>s.t!=='C').map(s=>[Math.min(s.x1,s.x2),Math.max(s.x1,s.x2)]).sort((a,b)=>a[0]-b[0]);
    const cl=[];let cur={e:xs[0][1],n:0};for(const [a,b] of xs){if(a-cur.e>W*0.025){cl.push(cur);cur={e:b,n:0}}cur.e=Math.max(cur.e,b);cur.n++}cl.push(cur);
    gaps=cl.filter(c=>c.n>=0.2*xs.length).length>=2?1:0}
  return {svg,w:W,h:H,vb,segCount:acc.segs.length,pathLen:d.length,robust,gapsX:gaps,fills:acc.fills.length};}

fs.mkdirSync(OUT,{recursive:true});
const files=fs.readdirSync(SRC,{recursive:false}).filter(x=>x.toLowerCase().endsWith('.dwg')&&(!FILTER||new RegExp(FILTER,'i').test(x))).sort();
const log=[];
for(const fn of files){
 const rec={file:fn,status:'ok',views:[],errors:[],labels:[]};
 try{
  const buf=fs.readFileSync(path.join(SRC,fn));
  const d=lib.dwg_read_data(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),Dwg_File_Type.DWG);
  if(!d)throw new Error('dwg_read_data returned null');
  const db=lib.convert(d);
  rec.insunits=db.header?.INSUNITS??0;rec.dwgVersion=db.header?.ACADVER||null;
  const blocks={};for(const b of Object.values(db.tables.BLOCK_RECORD.entries))blocks[b.name]=b;
  rec.labels=db.entities.filter(e=>e.type==='TEXT'||e.type==='MTEXT').map(e=>String(e.text||e.contents||'').trim()).filter(Boolean).slice(0,12);
  // 뷰 후보: 모델스페이스 INSERT가 가리키는 블록, 없으면 이름 규칙으로 전체 블록
  let cand=db.entities.filter(e=>e.type==='INSERT').map(e=>({name:e.name,ins:e}));
  const seen=new Set(cand.map(c=>c.name));
  for(const b of Object.values(blocks)){if(/^\*/.test(b.name)||seen.has(b.name))continue;if(code(b.name)&&code(b.name).conf==='name'&&(b.entities||[]).length>0){cand.push({name:b.name,ins:null,orphan:true})}}
  const loose=db.entities.filter(e=>e.type!=='INSERT'&&!EXCL_TYPE.has(e.type));
  const viewsRaw=[];
  for(const c of cand){const b=blocks[c.name];if(!b||!(b.entities||[]).length)continue;
    const cd=code(c.name);const acc={segs:[],fills:[],excl:{},note:new Set()};
    collect([{type:'INSERT',name:c.name,insertionPoint:{x:0,y:0},xScale:1,yScale:1,rotation:0}],blocks,[1,0,0,1,0,0],acc,0);
    // 최상위 INSERT 변환은 시트 배치용이므로 무시(블록 원점 기준)
    viewsRaw.push({block:c.name,cd,acc,orphan:!!c.orphan})}
  // 이름 규칙에 안 맞는 블록은 "unknown"
  let uk=0;
  for(const v of viewsRaw){
    const kind=v.cd?v.cd.kind:'unknown';const variant=v.cd?(v.cd.conf==='catalog-code'?'':v.cd.v):'';
    const key=kind+(variant?'-'+variant:'')+(kind==='unknown'?'-'+(++uk):'');
    const out=renderSVG(v.acc);
    const rv={kind,variant,block:v.block,detect:v.cd?v.cd.conf:'none',excluded:v.acc.excl,notes:[...v.acc.note],flags:[]};
    if(!out||out.segCount===0){rv.flags.push('empty');rec.views.push(rv);continue}
    const dir=path.join(OUT,fn.replace(/\.dwg$/i,'').replace(/[^\w\-]+/g,'_'));fs.mkdirSync(dir,{recursive:true});
    let fkey=key.replace(/[^\w\-]+/g,'_');const _u=(rec._used=rec._used||{});_u[fkey]=(_u[fkey]||0)+1;if(_u[fkey]>1)fkey+='-b'+_u[fkey]; // 같은 종류 뷰가 여러 개여도 덮어쓰지 않음
    const rel=path.join(path.basename(dir),fkey+'.svg');
    fs.writeFileSync(path.join(OUT,rel),out.svg);
    Object.assign(rv,{svg:rel,widthUnits:out.w,heightUnits:out.h,viewBox:out.vb,segCount:out.segCount,bytes:out.svg.length});
    if(out.segCount<4)rv.flags.push('too-few-lines');
    const ar=out.w/out.h;if(ar>25||ar<0.04)rv.flags.push('extreme-aspect');
    if(out.robust&&(out.w>out.robust.w*2.2&&out.robust.w>0||out.h>out.robust.h*2.2&&out.robust.h>0))rv.flags.push('stray-geometry-or-excess-margin');
    if(out.gapsX>=1)rv.flags.push('multi-item-in-view?');
    if(rv.excluded.HATCH)rv.flags.push('hatch-skipped');
    if(out.bytes>4e6)rv.flags.push('large-svg');
    rec.views.push(rv)}
  // 모델 스페이스에 흩어진 선 (뷰 블록 밖) → 기록만
  if(loose.length){rec.looseEntities=loose.length;
    const items=loose.map(e=>{const a={segs:[],fills:[],excl:{},note:new Set()};collect([e],blocks,I,a,0);const B=bb();for(const s of a.segs){if(s.t==='C'){grow(B,s.cx-s.r,s.cy-s.r);grow(B,s.cx+s.r,s.cy+s.r)}else{grow(B,s.x1,s.y1);grow(B,s.x2,s.y2)}}return {e,a,B}}).filter(x=>x.a.segs.length||x.a.fills.length);
    if(items.length&&items.length<=4000){const G=bb();items.forEach(i=>{grow(G,i.B.x0,i.B.y0);grow(G,i.B.x1,i.B.y1)});
      const ext=Math.max(G.x1-G.x0,G.y1-G.y0);
      const KEEP_GROUND=/^(mini-fridge)/i.test(fn);const ground=KEEP_GROUND?[]:items.filter(i=>i.e.type==='LINE'&&Math.abs(i.B.y1-i.B.y0)<1e-6*ext&&(i.B.x1-i.B.x0)>0.5*ext);
      const gset=new Set(ground);rec.groundLines=ground.length;
      const rest=items.filter(i=>!gset.has(i));const gap=ext*0.02;const par=rest.map((_,i)=>i);const f=i=>par[i]===i?i:(par[i]=f(par[i]));
      for(let i=0;i<rest.length;i++)for(let j=i+1;j<rest.length;j++){const a=rest[i].B,b=rest[j].B;if(a.x0-gap<=b.x1&&b.x0-gap<=a.x1&&a.y0-gap<=b.y1&&b.y0-gap<=a.y1)par[f(i)]=f(j)}
      const cl={};rest.forEach((it,i)=>(cl[f(i)]=cl[f(i)]||[]).push(it));let k=0;
      for(const grp of Object.values(cl)){const acc={segs:[],fills:[],excl:{},note:new Set()};grp.forEach(g=>{acc.segs.push(...g.a.segs);acc.fills.push(...g.a.fills)});
        const out=renderSVG(acc);if(!out)continue;k++;
        const rv={kind:'unknown',variant:'',block:'(model-space loose geometry)',detect:'none',excluded:{},notes:[],flags:['loose-model-geometry']};
        const dir=path.join(OUT,fn.replace(/\.dwg$/i,'').replace(/[^\w\-]+/g,'_'));fs.mkdirSync(dir,{recursive:true});
        const rel=path.join(path.basename(dir),'loose-'+k+'.svg');fs.writeFileSync(path.join(OUT,rel),out.svg);
        Object.assign(rv,{svg:rel,widthUnits:out.w,heightUnits:out.h,viewBox:out.vb,segCount:out.segCount,bytes:out.svg.length});rec.views.push(rv)}}}
  lib.dwg_free(d);
 }catch(e){rec.status='error';rec.errors.push(String(e).slice(0,200))}
 delete rec._used;log.push(rec);
 process.stdout.write(rec.status==='ok'?'.':'E');
}
fs.writeFileSync(path.join(OUT,'..','extract-raw.json'),JSON.stringify(log));
console.log('\nfiles',log.length,'errors',log.filter(r=>r.status!=='ok').length);
