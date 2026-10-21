// Categorize failures and redact connection strings and configured secrets before logging unknown errors.
export function startupDiagnostic(error) {
 const stages=['authentication-configuration','database-connect','database-schema','administrator-bootstrap','database-configuration','prisma-module-load','initialization','application-module-load'];
 const message=String(error?.message||'');
 const code=error?.errorCode ?? error?.code;
 let reason='UNCLASSIFIED_STARTUP_ERROR';
 if(message.includes('JWT_SECRET must contain'))reason='JWT_SECRET_MISSING_OR_TOO_SHORT';
 else if(message.includes('signing keys must be different'))reason='JWT_AND_SSO_SECRETS_IDENTICAL';
 else if(message.includes('MAIN_ADMIN_PASSWORD_HASH'))reason='ADMIN_PASSWORD_HASH_MISSING_OR_INVALID';
 else if(message.includes('DATABASE_URL must be'))reason='DATABASE_URL_MISSING_OR_INVALID';
 else if(/could not locate.*query engine|query engine.*not found|query_engine.*cannot open/i.test(message))reason='PRISMA_ENGINE_MISSING';
 else if(/Cannot find module|Cannot find package|ERR_MODULE_NOT_FOUND/.test(message))reason='DEPENDENCY_MISSING';
 if(reason==='UNCLASSIFIED_STARTUP_ERROR')reason=({P1000:'DATABASE_AUTHENTICATION_FAILED',P1001:'DATABASE_UNREACHABLE',P1002:'DATABASE_CONNECT_TIMEOUT',P1003:'DATABASE_NOT_FOUND',P1010:'DATABASE_ACCESS_DENIED',P1011:'DATABASE_TLS_ERROR',P1012:'PRISMA_CONFIGURATION_ERROR',P1013:'DATABASE_CONNECTION_STRING_INVALID',P1017:'DATABASE_CONNECTION_CLOSED'})[code]||reason;
 let detail=message;
 for(const [key,value] of Object.entries(process.env))if(/SECRET|PASSWORD|TOKEN|DATABASE|POSTGRES|PGHOST|PGUSER|DIRECT_URL/i.test(key)&&value&&value.length>=4)detail=detail.split(value).join('[REDACTED]');
 detail=detail.replace(/postgres(?:ql)?:\/\/[^\s\"'`]+/gi,'[REDACTED_DATABASE_URL]').replace(/(password|secret|token)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]');
 return {detail:reason==='UNCLASSIFIED_STARTUP_ERROR'?detail.slice(0,1200):undefined,stage:stages.includes(error?.startupStage)?error.startupStage:'unknown',code:/^(P\d{4}|ERR_[A-Z_]+|E[A-Z_]{2,30}|MODULE_NOT_FOUND)$/.test(code||'')?code:'UNAVAILABLE',reason};
}
