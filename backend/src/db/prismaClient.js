import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Prisma 5's CommonJS engine resolver uses eval("__dirname"). Keep its generated
// runtime outside the ESM service bundle; vercel.json includes this directory.
const nativeRequire=createRequire(import.meta.url);
const candidates=[
 fileURLToPath(new URL('../../generated/client/index.js',import.meta.url)),
 resolve(process.cwd(),'generated/client/index.js'),
 resolve(process.cwd(),'backend/generated/client/index.js')
];
const filename=candidates.find(path=>existsSync(path));
if(!filename)throw new Error('Generated Prisma client files are missing from the deployment.');
const client=nativeRequire(filename);
export default client;
