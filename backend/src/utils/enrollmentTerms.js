import {moneyMinor} from './numbers.js';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function enrollmentTerms(body,courseFee){
 const standard=moneyMinor(courseFee,'Standard tuition fee');
 const supplied=value=>value!==undefined&&value!==null&&value!=='';
 let type=body.tuitionType??(body.exempt===true?'EXEMPT':supplied(body.customFee)?Number(body.customFee)===0?'EXEMPT':'DISCOUNTED':'FULL');
 if(!['FULL','DISCOUNTED','EXEMPT'].includes(type))fail('Choose full payment, discounted payment or exemption.');
 if(body.exempt!==undefined&&typeof body.exempt!=='boolean')fail('Invalid exemption choice.');
 if(body.recordPayment!==undefined&&typeof body.recordPayment!=='boolean')fail('Invalid payment choice.');
 if(type==='FULL'&&standard===0n)type='EXEMPT';
 if(type!=='EXEMPT'&&body.recordPayment===false)fail('Unpaid enrollment is not allowed. Choose full payment, discounted payment or exemption.');
 let fee=standard;
 if(type==='EXEMPT')fee=0n;
 if(type==='DISCOUNTED'){
  const value=supplied(body.customFee)?body.customFee:body.amountPaid;
  fee=moneyMinor(value,'Discounted amount');
  if(fee<=0n||fee>=standard)fail('Discounted payment must be greater than zero and below the standard fee. Choose Exempt for a free student.');
 }
 if(type==='FULL'&&supplied(body.customFee)&&moneyMinor(body.customFee)!==standard)fail('Choose Discounted when lowering the standard fee.');
 const paid=supplied(body.amountPaid)?moneyMinor(body.amountPaid,'Amount received'):fee;
 if(paid!==fee)fail(`This enrollment must be fully settled: record ${Number(fee)/100} EGP for the chosen tuition type. Partial or unpaid enrollments are not allowed.`);
 return {tuitionType:type,exempt:type==='EXEMPT',recordPayment:type!=='EXEMPT',customFee:type==='FULL'?null:Number(fee)/100,amountPaid:Number(paid)/100};
}
