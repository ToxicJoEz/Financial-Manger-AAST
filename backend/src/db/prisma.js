import 'dotenv/config';
import { prepareRuntimeDatabase } from '../utils/runtimeDatabase.js';
import pkg from '../../generated/client/index.js';
import { mutationContext, auditSnapshot } from '../utils/mutationContext.js';
prepareRuntimeDatabase();
const base = new pkg.PrismaClient();
const mutations = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']);
const auditedModels = new Set(['user', 'course', 'cycle', 'instructor', 'student', 'enrollment', 'paymentEntry', 'pendingAssignment', 'payrollRecord', 'studentRequest', 'payrollEarning', 'instructorPaymentBatch', 'bookPayment']);

// Controllers use the same client inside atomic(), including their existing transaction callbacks.
const prisma = new Proxy(base, {
  get(target, property) {
    const context = mutationContext.getStore();
    const client = context?.tx || target;
    if (property === '$transaction' && context?.tx) return async callback => {
      if (typeof callback !== 'function') throw new Error('Nested batch transactions are unsupported.');
      return callback(prisma);
    };
    const member = client[property];
    if (auditedModels.has(property) && context?.tx) return new Proxy(member, {
      get(model, operation) {
        const method = model[operation];
        if (!mutations.has(operation)) return typeof method === 'function' ? method.bind(model) : method;
        return async args => {
          const before = operation === 'create' || operation === 'createMany' ? [] : await model.findMany({ where: args.where });
          const result = await method.call(model, args);
          if (context.actor) {
            const ids = before.map(row => row.id);
            const after = operation === 'delete' || operation === 'deleteMany' ? [] : operation === 'createMany' ? auditSnapshot(args.data) : await model.findMany({ where: ids.length ? { id: { in: ids } } : { id: result.id } });
            const old = auditSnapshot(before);
            const changed = before.length === 1 && Array.isArray(after) && after.length === 1
              ? Object.fromEntries(Object.keys(after[0]).filter(key => !/password|token|secret/i.test(key) && JSON.stringify(auditSnapshot(before[0][key])) !== JSON.stringify(auditSnapshot(after[0][key]))).map(key => [key, { before: auditSnapshot(before[0][key]), after: auditSnapshot(after[0][key]) }]))
              : { before: old, after: auditSnapshot(after) };
            await context.tx.systemLog.create({ data: { action: `${property.toUpperCase()}_${String(operation).toUpperCase()}`, description: JSON.stringify({ entity: property, ids: ids.length ? ids : [result.id].filter(Boolean), changes: changed }), actorUsername: context.actor } });
          }
          return result;
        };
      }
    });
    return typeof member === 'function' ? member.bind(client) : member;
  }
});

export function atomic(handler, { timeout = 20000 } = {}) {
  return async (req, res, next) => {
    let response;
    const buffered = Object.create(res);
    buffered.statusCode = res.statusCode || 200;
    buffered.status = code => { buffered.statusCode = code; return buffered; };
    buffered.json = body => { response = { status: buffered.statusCode, body }; return buffered; };
    try {
      await base.$transaction(tx => mutationContext.run({ tx, actor: req.user?.username }, async () => {
        await handler(req, buffered, error => { throw error; });
        if (!response) throw new Error('Mutation handler did not produce a response.');
        if (response.status >= 400) throw Object.assign(new Error('Request rejected'), { bufferedResponse: response });
      }), { maxWait: 10000, timeout, isolationLevel: 'Serializable' });
      res.status(response.status).json(response.body);
    } catch (error) {
      if (error.bufferedResponse) return res.status(error.bufferedResponse.status).json(error.bufferedResponse.body);
      if (error.status) return res.status(error.status).json({ error: error.message });
      if (['P2002', 'P2025', 'P2034', 'P2028'].includes(error.code)) return res.status(409).json({ error: 'The record changed or this request conflicts with another operation. Refresh and try again.' });
      res.status(buffered.statusCode >= 400 ? buffered.statusCode : 500);
      next(error);
    }
  };
}
export default prisma;
