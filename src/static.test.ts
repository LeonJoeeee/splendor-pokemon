import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceServer = fileURLToPath(new URL('../server/static.mjs', import.meta.url));

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function response(port: number, urlPath: string, method = 'GET') {
  return new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: urlPath, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        type: String(res.headers['content-type'] ?? ''),
        body: Buffer.concat(chunks).toString(),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('production static server HTTP behavior', () => {
  let directory: string;
  let port: number;
  let child: ChildProcessWithoutNullStreams;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'splendor-static-test-'));
    await mkdir(path.join(directory, 'server'));
    await mkdir(path.join(directory, 'dist', 'assets'), { recursive: true });
    await writeFile(path.join(directory, 'server', 'static.mjs'), await readFile(sourceServer));
    await writeFile(path.join(directory, 'dist', 'index.html'), '<html>app shell</html>');
    await writeFile(path.join(directory, 'dist', 'assets', 'existing.js'), 'export const ready = true;');
    await writeFile(path.join(directory, 'outside.txt'), 'outside root');
    await symlink(path.join(directory, 'outside.txt'), path.join(directory, 'dist', 'assets', 'outside.txt'));
    port = await availablePort();
    child = spawn(process.execPath, [path.join(directory, 'server', 'static.mjs')], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    });
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.stdout.once('data', () => resolve());
      child.once('exit', (code) => reject(new Error(`Static server exited: ${code}`)));
    });
  });

  afterAll(async () => {
    child?.kill();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('serves an existing asset with its MIME type', async () => {
    expect(await response(port, '/assets/existing.js')).toEqual({
      status: 200, type: 'text/javascript; charset=utf-8', body: 'export const ready = true;',
    });
  });

  it.each(['/sprites/999999.png', '/assets/not-real.js', '/favicon.ico', '/assets/%ZZ.js'])('returns 404 for missing resource %s', async (urlPath) => {
    const result = await response(port, urlPath);
    expect(result.status).toBe(404);
    expect(result.type).toBe('text/plain; charset=utf-8');
    expect(result.body).not.toContain('app shell');
  });

  it.each(['/favicon.svg/extra', '/favicon.svg/'])('returns 404 for a resource segment followed by more path: %s', async (urlPath) => {
    expect(await response(port, urlPath)).toEqual({
      status: 404, type: 'text/plain; charset=utf-8', body: 'Not Found',
    });
  });

  it('returns 404 for a traversal attempt and a symlink outside the build root', async () => {
    expect((await response(port, '/assets/%2e%2e/%2e%2e/outside.txt')).status).toBe(404);
    expect((await response(port, '/assets/outside.txt')).status).toBe(404);
  });

  it('falls back to the app shell for an unknown extensionless page route', async () => {
    expect(await response(port, '/solo/new-game?from=bookmark')).toEqual({
      status: 200, type: 'text/html; charset=utf-8', body: '<html>app shell</html>',
    });
  });

  it('preserves HEAD status and sends no body', async () => {
    for (const [urlPath, status] of [['/assets/existing.js', 200], ['/assets/not-real.js', 404], ['/favicon.svg/extra', 404], ['/favicon.svg/', 404], ['/solo/new-game', 200]] as const) {
      const result = await response(port, urlPath, 'HEAD');
      expect(result.status).toBe(status);
      expect(result.body).toBe('');
    }
  });

  it('does not serve an app shell symlink outside the build root', async () => {
    const index = path.join(directory, 'dist', 'index.html');
    await rm(index);
    await writeFile(path.join(directory, 'outside.html'), '<html>outside root</html>');
    await symlink(path.join(directory, 'outside.html'), index);
    try {
      expect((await response(port, '/')).status).toBe(404);
      expect((await response(port, '/solo/new-game')).status).toBe(404);
    } finally {
      await rm(index);
      await writeFile(index, '<html>app shell</html>');
    }
  });
});
