import { moneyMinor } from './numbers.js';
export function assertWithinFee(amount, fee) {
  if (moneyMinor(amount, 'Collected amount') > moneyMinor(fee, 'Tuition fee')) {
    throw Object.assign(new Error(`This student's tuition fee is ${Number(fee).toLocaleString('en-EG')} EGP. You cannot record ${Number(amount).toLocaleString('en-EG')} EGP paid. Reduce the payment or correct the tuition fee first.`), { status: 400 });
  }
}
export function financialChoice(body) {
  if (typeof body?.keepFinancialRecords !== 'boolean') throw Object.assign(new Error('Choose whether to keep financial records in course totals or archive them.'), { status: 400 });
  if (body.confirm !== true) throw Object.assign(new Error('Confirm this removal and its financial consequences.'), { status: 400 });
  return body.keepFinancialRecords;
}
