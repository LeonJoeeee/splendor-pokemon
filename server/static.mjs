// Dependency-free static file server for the production build (dist/).
// Serves the single-player game over plain HTTP for a local reverse proxy /
// Cloudflare tunnel to sit in front of. No Host-header allowlist (unlike
// `vite preview`), so it works behind ephemeral *.trycloudflare.com hostnames.
//
// Run:  node server/static.mjs        (PORT=4173 HOST=127.0.0.1 by default)
import http from 'node:http';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const INDEX = path.join(ROOT, 'index.html');

function parsePath(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\') ||
      pathname.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  return pathname;
}

function isResourcePath(pathname) {
  return pathname.split('/').some((segment) => path.extname(segment) !== '') ||
    pathname === '/assets' || pathname.startsWith('/assets/') ||
    pathname === '/sprites' || pathname.startsWith('/sprites/');
}

async function confinedFile(candidate) {
  try {
    const realRoot = await fs.realpath(ROOT);
    const realCandidate = await fs.realpath(candidate);
    if (realCandidate === realRoot || realCandidate.startsWith(realRoot + path.sep)) return candidate;
  } catch {}
  return null;
}

async function resolveFile(pathname) {
  if (pathname === '/' || pathname === '') return INDEX;
  const candidate = path.join(ROOT, path.normalize(pathname));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null; // traversal
  try {
    const st = await fs.stat(candidate);
    if (st.isFile()) return candidate;
    if (st.isDirectory()) {
      const idx = path.join(candidate, 'index.html');
      try { if ((await fs.stat(idx)).isFile()) return idx; } catch {}
    }
  } catch {}
  return null;
}

function cacheControl(file) {
  // Vite emits content-hashed files under /assets — safe to cache forever.
  if (file.startsWith(path.join(ROOT, 'assets') + path.sep)) {
    return 'public, max-age=31536000, immutable';
  }
  if (file === INDEX) return 'no-cache';
  return 'public, max-age=3600';
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }
  const pathname = parsePath(req.url || '/');
  if (pathname === null) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Not Found');
    return;
  }
  let file = await resolveFile(pathname);
  // Only navigation paths without a file extension use the SPA fallback.
  if (!file && !isResourcePath(pathname)) file = INDEX;
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Not Found');
    return;
  }
  let st;
  try { st = await fs.stat(file); } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Not Found (dist/index.html missing — run `npm run build`)');
    return;
  }
  if (!(await confinedFile(file))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : 'Not Found');
    return;
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': st.size,
    'Cache-Control': cacheControl(file),
  });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(file);
  stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); });
  stream.pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[static] 璀璨宝石：宝可梦 -> http://${HOST}:${PORT}  (serving ${ROOT})`);
});
