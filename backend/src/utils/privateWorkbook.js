import {createHash} from 'node:crypto';
import {checkZip,importError} from './importWorkbook.js';
const digits=v=>String(v??'').replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
export function phoneNumbers(value){return [...new Set(digits(value).split(/[\/،,;\n]|\s+(?:or|او|أو)\s+/i).map(v=>{let n=v.replace(/[^0-9+]/g,'');if(n.startsWith('0020'))n=n.slice(4);else if(n.startsWith('+20'))n=n.slice(3);if(/^1[0125]\d{8}$/.test(n))n='0'+n;return n.replace(/^\+/, '');}).filter(n=>/^\d{7,15}$/.test(n)))];}
export function privateDate(value){
 if(value==null||value==='')return {value:'',note:''};
 if(value instanceof Date)return {value:value.toISOString().slice(0,10),note:''};
 const raw=digits(value).trim();let m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,5})$/),y,month,d,note='';
 if(m){[,d,month,y]=m;if(y.length===2)y='20'+y;if(y.length===5){const candidates=[...new Set([...y].flatMap((digit,i)=>(y[i-1]===digit||y[i+1]===digit)?[y.slice(0,i)+y.slice(i+1)]:[]).filter(s=>/^20\d{2}$/.test(s)))];if(candidates.length!==1)return {value:'',note:`Review ambiguous date: ${raw}`};note=`Corrected ${raw} → ${d.padStart(2,'0')}/${month.padStart(2,'0')}/${candidates[0].slice(2)}`;y=candidates[0];}}
 else {m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return {value:'',note:`Review invalid date: ${raw}`};[,y,month,d]=m;}
 const iso=`${y}-${month.padStart(2,'0')}-${d.padStart(2,'0')}`;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)return {value:'',note:`Review invalid date: ${raw}`};
 return {value:iso,note};
}
export function privateHours(value){const m=digits(value).trim().match(/^(\d+(?:\.\d+)?)(?::(\d{1,2}))?/);if(!m)return '';if(m[2]&&Number(m[2])>=60)return '';return Number(m[1])+(Number(m[2]||0)/60);}
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function parsePrivateWorkbook(buffer){
 checkZip(buffer);const [{default:ExcelJS},{default:unzipper}]=await Promise.all([import('exceljs'),import('unzipper')]);
 const archive=await unzipper.Open.buffer(buffer);let total=0;for(const file of archive.files){let size=0;const stream=file.stream();try{for await(const chunk of stream){size+=chunk.length;total+=chunk.length;if(size>10*1024*1024||total>20*1024*1024)throw importError('Workbook expands beyond the supported size.');}}finally{stream.destroy();}}
 const wb=new ExcelJS.Workbook();try{await wb.xlsx.load(buffer);}catch{throw importError('Upload a valid .xlsx workbook.');}
 if(wb.worksheets.length>30)throw importError('Use at most 30 employee sheets per import.');
 const sheets=[],rows=[],warnings=[];
 const text=c=>{const v=c.value;if(v&&typeof v==='object'&&('formula'in v||'sharedFormula'in v))throw importError('Formula cells are not supported in course data. Export values only.');return String(c.text||'').replace(/[\u200e\u200f]/g,'').replace(/\s+/g,' ').trim();};
 const norm=v=>v.toLowerCase().replace(/[^a-z]/g,'');
 for(const [index,s] of wb.worksheets.entries()){
  if(s.rowCount>2000||s.columnCount>100)throw importError('A sheet exceeds the supported size (2,000 rows / 100 columns).');
  let header,cols={};for(let n=1;n<=Math.min(30,s.rowCount);n++){const c={};s.getRow(n).eachCell((cell,col)=>{const key=norm(text(cell));if(key==='name')c.name=col;else if(key==='phonenumber'||key==='phone')c.mobile=col;else if(key==='course')c.cycleName=col;else if(['date','startdate'].includes(key))c.startDate=col;else if(['enddate','finishdate'].includes(key))c.endDate=col;else if(key==='duration')c.hours=col;else if(key==='amount')c.amount=col;else if(key==='currency')c.currency=col;});if(c.name&&c.mobile&&c.cycleName&&c.amount){header=n;cols=c;break;}}
  if(!header){warnings.push(`Skipped sheet ${s.name}: no private-course table found.`);continue;}
  const sheetId=String(index);sheets.push({id:sheetId,name:s.name.trim()});
  for(let n=header+1;n<=s.rowCount;n++){
   const cell=k=>cols[k]?s.getRow(n).getCell(cols[k]):null;
   const name=text(cell('name'));if(!name)continue;
   const notes=[],dateIssues={},getDate=k=>{const c=cell(k);if(!c)return '';let v=c.value;if(c.isMerged)v=c.master.value;const result=privateDate(v instanceof Date?v:text(c));if(!result.value&&text(c))dateIssues[k]=true;if(result.note)notes.push(`${k==='startDate'?'Start':'End'}: ${result.note}`);return result.value;};
   const amountText=text(cell('amount')),amount=/^free$/i.test(amountText)?0:Number(digits(amountText).replace(/[,\s]/g,''));
   const currency=cell('currency')?text(cell('currency')):'';
   if(currency&&!/^EGP$/i.test(currency))notes.push(`Unsupported currency: ${currency}`);
   const row={id:`${sheetId}:${n}`,sheetId,sheet:s.name.trim(),sourceRow:n,name,mobile:text(cell('mobile')),cycleName:text(cell('cycleName')),startDate:getDate('startDate'),endDate:getDate('endDate'),hours:privateHours(cell('hours')?text(cell('hours')):''),amount:amountText!==''&&Number.isFinite(amount)?amount:'',branch:'',bookPrice:0,hourlyRate:'',notes,currency,dateIssues};
   row.fingerprint=hash({sheet:row.sheet,row:n,name:row.name,mobile:row.mobile,course:row.cycleName,start:row.startDate,end:row.endDate,hours:row.hours,amount:row.amount});rows.push(row);
   if(rows.length>500)throw importError('Import at most 500 private cycles at a time.');
  }
 }
 if(!rows.length)throw importError('No student course entries were found. Number-only rows are ignored.');
 return {sheets:sheets.filter(s=>rows.some(r=>r.sheetId===s.id)),rows,warnings};
}
