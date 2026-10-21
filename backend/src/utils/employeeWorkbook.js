import { checkZip, importError } from './importWorkbook.js';
import { employeeName, employeeNumber } from './employees.js';
const header = value => employeeName(value).replace(/[أإآ]/g,'ا').replace(/[\s_\-]/g,'').toLowerCase();
export async function parseEmployeeWorkbook(buffer) {
  checkZip(buffer);
  const [{default:ExcelJS},{default:unzipper}] = await Promise.all([import('exceljs'),import('unzipper')]);
  try {
    let total=0;
    const directory=await unzipper.Open.buffer(buffer);
    for(const file of directory.files){let size=0;const stream=file.stream();try{for await(const chunk of stream){size+=chunk.length;total+=chunk.length;if(size>10*1024*1024 || total>20*1024*1024)throw importError('Workbook expands beyond the supported size.');}}finally{stream.destroy();}}
  } catch(error){throw importError(error.status?error.message:'Invalid workbook archive.');}
  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(buffer);}catch{throw importError('Upload a readable .xlsx workbook.');}
  let source;
  for(const sheet of workbook.worksheets) {
    if(sheet.rowCount>5000 || sheet.columnCount>100)throw importError('Use at most 2,000 employees and 100 columns per workbook.');
    for(let n=1;n<=Math.min(sheet.rowCount,30);n++){
      const row=sheet.getRow(n);let nameCol,idCol;
      row.eachCell((cell,col)=>{const text=header(cell.text);if(['الاسم','اسم','اسمالموظف','name','employeename','fullname'].includes(text))nameCol=col;if(['الرقمالوظيفي','رقموظيفي','الرقمالوظيفى','employeeid','employeenumber'].includes(text))idCol=col;});
      if(nameCol&&idCol){if(source)throw importError('Use one employee list per workbook.');source={sheet,headerRow:n,nameCol,idCol};break;}
    }
  }
  if(!source)throw importError('Could not find name and employee ID headers (الاسم / الرقم الوظيفي).');
  const rows=[];
  const read=cell=>{const value=cell.value;if(value&&typeof value==='object'&&('formula' in value || 'sharedFormula' in value))throw importError('Formula cells are not supported. Upload values only.');return cell.text || '';};
  for(let n=source.headerRow+1;n<=source.sheet.rowCount;n++){
    const row=source.sheet.getRow(n), nameCell=row.getCell(source.nameCol),idCell=row.getCell(source.idCol);
    if(nameCell.value==null&&idCell.value==null)continue;
    let name='',employeeId='',issues=[];
    try {
      name=employeeName(read(nameCell));employeeId=employeeNumber(read(idCell));
      if(typeof idCell.value==='number'){
        if(!Number.isSafeInteger(idCell.value)||idCell.value<0)throw importError('Employee ID must be a whole number or text.');
        if(/^0+$/.test(idCell.numFmt || ''))employeeId=employeeId.padStart(idCell.numFmt.length,'0');
      }
      if(!name || name.length>160)issues.push('Enter a name of 1–160 characters.');
      if(!employeeId || employeeId.length>80)issues.push('Enter an employee ID of 1–80 characters.');
    }catch(error){issues.push(error.message);}
    rows.push({rowNumber:n,name,employeeId,issues});
    if(rows.length>2000)throw importError('Import at most 2,000 employees at a time.');
  }
  if(!rows.length)throw importError('No employees were found below the headers.');
  return {sheetName:source.sheet.name,rows};
}
