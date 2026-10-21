// Log only fixed categories and validated codes. Never log raw errors, URLs or secret values.
export function startupDiagnostic(error) {
 const stages=['authentication-configuration','database-connect','database-schema','administrator-bootstrap','database-configuration','prisma-module-load','initialization','application-module-load'];
 const message=String(error?.message||'');
 let reason='UNCLASSIFIED_STARTUP_ERROR';
 if(message.includes('JWT_SECRET must contain'))reason='JWT_SECRET_MISSING_OR_TOO_SHORT';
 else if(message.includes('signing keys must be different'))reason='JWT_AND_SSO_SECRETS_IDENTICAL';
 else if(message.includes('MAIN_ADMIN_PASSWORD_HASH'))reason='ADMIN_PASSWORD_HASH_MISSING_OR_INVALID';
 else if(message.includes('DATABASE_URL must be'))reason='DATABASE_URL_MISSING_OR_INVALID';
 else if(/could not locate.*query engine|query engine.*not found|query_engine.*cannot open/i.test(message))reason='PRISMA_ENGINE_MISSING';
 else if(/Cannot find module|Cannot find package|ERR_MODULE_NOT_FOUND/.test(message))reason='DEPENDENCY_MISSING';
 return {stage:stages.includes(error?.startupStage)?error.startupStage:'unknown',code:/^(P\d{4}|ERR_[A-Z_]+|E[A-Z_]{2,30}|MODULE_NOT_FOUND)$/.test(error?.code||'')?error.code:'UNAVAILABLE',reason};
}
