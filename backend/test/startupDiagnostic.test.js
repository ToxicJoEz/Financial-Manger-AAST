import test from 'node:test';
import assert from 'node:assert/strict';
import {startupDiagnostic} from '../src/utils/startupDiagnostic.js';
test('startup diagnostics identify failures without exposing error text or credentials',()=>{
 const error=Object.assign(new Error('Cannot find module postgres://user:PRIVATE@host/db'),{startupStage:'prisma-module-load',code:'MODULE_NOT_FOUND'});
 assert.deepEqual(startupDiagnostic(error),{stage:'prisma-module-load',code:'MODULE_NOT_FOUND',reason:'DEPENDENCY_MISSING'});
 assert(!JSON.stringify(startupDiagnostic(error)).includes('PRIVATE'));
 assert.equal(startupDiagnostic(new Error('JWT_SECRET must contain at least 32 characters.')).reason,'JWT_SECRET_MISSING_OR_TOO_SHORT');
 assert.equal(startupDiagnostic({message:'secret',startupStage:'secret',code:'secret'}).stage,'unknown');
 assert.equal(startupDiagnostic({code:'P1001',startupStage:'database-connect'}).code,'P1001');
});
