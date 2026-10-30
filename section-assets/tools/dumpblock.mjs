// 진단용: 블록 엔티티를 JSON으로 덤프 (읽기 전용). usage: node dumpblock.mjs file.dwg blockName out.json
import {LibreDwg,Dwg_File_Type} from '@mlightcad/libredwg-web';
import fs from 'fs';
const [,,FILE,BLOCK,OUT]=process.argv;
const lib=await LibreDwg.create();
const buf=fs.readFileSync(FILE);
const d=lib.dwg_read_data(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),Dwg_File_Type.DWG);
const db=lib.convert(d);
const blocks={};for(const b of Object.values(db.tables.BLOCK_RECORD.entries))blocks[b.name]=b;
const b=BLOCK==='MODEL'?{entities:db.entities,basePoint:{x:0,y:0}}:blocks[BLOCK];
const slim=e=>({type:e.type,layer:e.layer,ltype:e.lineType,color:e.colorIndex,s:e.startPoint,e:e.endPoint,c:e.center,r:e.radius,a0:e.startAngle,a1:e.endAngle,v:e.vertices,flag:e.flag,name:e.name,ip:e.insertionPoint,sx:e.xScale,sy:e.yScale,rot:e.rotation,text:e.text,
 cp:e.controlPoints,fp:e.fitPoints,kn:e.knots,deg:e.degree,maj:e.majorAxisEndPoint,ar:e.axisRatio,bp:e.basePoint});
fs.writeFileSync(OUT,JSON.stringify({base:b.basePoint,ents:(b.entities||[]).map(slim)}));
console.log('ok',(b.entities||[]).length);
