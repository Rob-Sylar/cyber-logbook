// Minimal static file server for the tests (serves the project root).
// base mimics GitHub Pages' sub-folder; transform(relPath, buffer) can change a file on the way out.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function startStaticServer({ port = 0, base = '/', transform = null } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === base.replace(/\/$/, '') && base !== '/') {
        res.writeHead(301, { Location: base });
        res.end();
        return;
      }
      if (!url.pathname.startsWith(base)) throw new Error('outside base');
      let rel = decodeURIComponent(url.pathname.slice(base.length - 1));
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}node_modules${path.sep}`)) throw new Error('forbidden');
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      let body = await readFile(file);
      if (transform) body = transform(rel, body);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) }));
  });
}
