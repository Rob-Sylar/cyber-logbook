// Starts the test web server. PORT and BASE (e.g. /cyber-logbook/) mimic GitHub Pages' sub-folder.
import { startStaticServer } from './static-server.mjs';

const port = Number(process.env.PORT || 4173);
const base = process.env.BASE || '/';
await startStaticServer({ port, base });
console.log(`Cyber Logbook test server: http://localhost:${port}${base}`);
