import test from 'node:test';
import assert from 'node:assert/strict';
import {enrollmentTerms} from '../src/utils/enrollmentTerms.js';
test('Enrollment always settles tuition as full, discounted or exempt',()=>{
 assert.equal(enrollmentTerms({},1000).amountPaid,1000);
 assert.equal(enrollmentTerms({tuitionType:'DISCOUNTED',customFee:750,amountPaid:750},1000).customFee,750);
 assert.equal(enrollmentTerms({tuitionType:'EXEMPT',amountPaid:0},1000).customFee,0);
 assert.equal(enrollmentTerms({},0).tuitionType,'EXEMPT');
 for(const body of [{recordPayment:false},{amountPaid:500},{amountPaid:0},{amountPaid:1100},{tuitionType:'DISCOUNTED',amountPaid:400,customFee:500},{tuitionType:'DISCOUNTED',amountPaid:0},{tuitionType:'EXEMPT',amountPaid:50}])assert.throws(()=>enrollmentTerms(body,1000));
});
