import express from 'express';
import {startupDiagnostic} from './utils/startupDiagnostic.js';
import { prepareRuntimeDatabase } from './utils/runtimeDatabase.js';

let application;
async function loadApplication() {
  if (!application) application = (async () => {
    let stage='database-configuration';
    try {
    prepareRuntimeDatabase();
    stage='prisma-module-load';
    const { initialize } = await import('./utils/initialize.js');
    stage='initialization';
    await initialize();
    stage='application-module-load';
    const { default: app } = await import('./app.js');
    return app;
    } catch(error) { error.startupStage ||= stage; throw error; }
  })().catch(error => { application = undefined; throw error; });
  return application;
}

async function handler(req, res) {
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
  } catch(error) {
    // Never return initialization details, filesystem paths, or secrets to clients.
    console.error('Finance API initialization failed.', startupDiagnostic(error));
    return res.status(503).json({ error: 'The API could not initialize. Check the deployment configuration.' });
  }
}

// Explicit Express service entry; initialization completes before requests reach routes.
const service = express();
service.use(handler);
export default service;
