import { prepareRuntimeDatabase } from '../backend/src/utils/runtimeDatabase.js';

let application;
async function loadApplication() {
  if (!application) application = (async () => {
    prepareRuntimeDatabase();
    const { initialize } = await import('../backend/src/utils/initialize.js');
    await initialize();
    const { default: app } = await import('../backend/src/app.js');
    return app;
  })().catch(error => { application = undefined; throw error; });
  return application;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    // Vercel rewrites API paths to this function. Preserve ordinary query filters.
    const url = new URL(req.url, 'http://internal');
    const route = req.query?.__route ?? url.searchParams.get('__route');
    if (route != null) {
      url.pathname = '/api/' + (Array.isArray(route) ? route.join('/') : route);
      url.searchParams.delete('__route');
      req.url = url.pathname + url.search;
      if (req.query) delete req.query.__route;
    }
    const app = await loadApplication();
    return app(req, res);
  } catch {
    // Never return initialization details, filesystem paths, or secrets to clients.
    console.error('Finance API initialization failed. Verify deployment configuration and bundled database.');
    return res.status(503).json({ error: 'The API could not initialize. Check the deployment configuration.' });
  }
}
