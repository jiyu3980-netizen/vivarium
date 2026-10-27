// 진단용: 파일의 뷰 블록별 엔티티 종류/레이어/범위를 출력 (읽기 전용)
import {LibreDwg,Dwg_File_Type} from '@mlightcad/libredwg-web';
import fs from 'fs';
const [,,FILE,BLOCK]=process.argv;
const lib=await LibreDwg.create();
const buf=fs.readFileSync(FILE);
const d=lib.dwg_read_data(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),Dwg_File_Type.DWG);
const db=lib.convert(d);
const blocks={};for(const b of Object.values(db.tables.BLOCK_RECORD.entries))blocks[b.name]=b;
console.log('insunits',db.header?.INSUNITS,'model entities',db.entities.length);
const sum=(ents,ind='')=>{const c={};for(const e of ents){const k=e.type+'@'+(e.layer||'');c[k]=(c[k]||0)+1}return c};
console.log('MODEL',JSON.stringify(sum(db.entities)));
for(const [n,b] of Object.entries(blocks)){if(/^\*/.test(n))continue;if(BLOCK&&!new RegExp(BLOCK,'i').test(n))continue;
 console.log('BLOCK',JSON.stringify(n),(b.entities||[]).length,JSON.stringify(sum(b.entities||[])));}
