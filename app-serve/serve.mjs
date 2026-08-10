// deckd-app static server. Tiny, no deps. Serves the exported web app on 127.0.0.1:8085.
// SPA fallback: unknown paths serve index.html so expo-router deep links work.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8085;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://deckd.local').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (urlPath.includes('\0')) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  let filePath = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  // Prevent path traversal outside ROOT.
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        // SPA fallback: let expo-router handle client-side routes.
        fs.readFile(path.join(ROOT, 'index.html'), (err3, indexData) => {
          if (err3) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            return res.end('Not found');
          }
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-cache',
          });
          res.end(indexData);
        });
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        // Hashed build assets are immutable; everything else revalidates.
        'cache-control': /[a-f0-9]{16,}\.(js|css|png|webp|jpg)$/.test(filePath)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      });
      res.end(data);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`deckd-landing serving ${ROOT} on http://127.0.0.1:${PORT}`));
