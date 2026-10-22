import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAudit} from '../src/utils/auditEvent.js';
test('audit snapshots omit credentials even inside diagnostic strings',()=>{
 const input={name:'Student',password:'HIDDEN_PASSWORD',newPassword:'HIDDEN_NEW',nested:{previewToken:'HIDDEN_PREVIEW'},message:'password: "HIDDEN_TEXT" postgres://user:HIDDEN_URL@host/db',paymentMethod:'CASH',amount:1000};
 const output=safeAudit(input),text=JSON.stringify(output);assert(!text.includes('HIDDEN_'));assert.equal(output.amount,1000);assert.equal(output.name,'Student');assert.equal(output.paymentMethod,'CASH');const a=safeAudit({avatar:'PRIVATE_IMAGE_A'}),b=safeAudit({avatar:'PRIVATE_IMAGE_B'});assert.notEqual(a.avatar.fingerprint,b.avatar.fingerprint);assert(!JSON.stringify(a).includes('PRIVATE_IMAGE_A'));
});
