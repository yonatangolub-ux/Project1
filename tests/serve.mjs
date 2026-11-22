// שרת קבצים מקומי. מגיש את האפליקציה תחת /Project1/, כמו ב-GitHub Pages.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
};

// overrides: מפה של נתיב ← תוכן, כדי לדמות גרסה חדשה של קובץ בבדיקה
export function serve(port = 8080, prefix = '/Project1', overrides = new Map()) {
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!p.startsWith(prefix + '/')) throw new Error('outside prefix');
      p = p.slice(prefix.length);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root + path.sep)) throw new Error('outside root');
      const data = overrides.has(p) ? overrides.get(p) : await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serve(8080).then(() => console.log('http://localhost:8080/Project1/'));
}
