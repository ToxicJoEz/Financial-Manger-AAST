import 'dotenv/config';
import app from './app.js';
import { initialize } from './utils/initialize.js';
const PORT = process.env.PORT || 5000;
try {
  await initialize();
  const server = app.listen(PORT, error => {
    if (!error) console.log(`Finance API listening on port ${PORT}`);
  });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE'
    ? `Backend could not start: port ${PORT} is already in use. Stop the previous server or choose a different PORT in backend/.env.`
    : `Backend failed to listen: ${error.code || error.message}`); process.exitCode = 1; });
} catch (error) {
  console.error('Backend startup failed:', error.message);
  process.exitCode = 1;
}
