import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

const STORAGE_DIR = path.resolve(process.cwd(), 'webdav_storage');

// Helper to normalize webdav url path to disk path
export function resolveWebdavPath(urlPath: string): string {
  const cleanPath = urlPath.split('?')[0];
  const relative = cleanPath.replace(/^\/webdav(\/|$)/, '');
  let decoded = relative;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    decoded = relative;
  }
  const safeRelative = path.normalize(decoded).replace(/^(\.\.[\/\\])+/, '');
  return path.join(STORAGE_DIR, safeRelative);
}

// Ensure base rooms folder exists
export async function initStorage() {
  const roomsDir = path.join(STORAGE_DIR, 'rooms');
  if (!existsSync(roomsDir)) {
    await fs.mkdir(roomsDir, { recursive: true });
  }
}

// Read raw request stream as Buffer
function getRequestBody(req: IncomingMessage & { body?: any }): Promise<Buffer> {
  if (req.body instanceof Buffer) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  if (req.body && typeof req.body === 'object') return Promise.resolve(Buffer.from(JSON.stringify(req.body)));

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Framework-agnostic Connect/Express middleware for WebDAV & API
export function webdavConnectMiddleware(req: IncomingMessage & { body?: any }, res: ServerResponse, next?: () => void) {
  const url = req.url || '';
  const pathname = url.split('?')[0];

  // Only handle /webdav/* and /api/rooms
  if (!pathname.startsWith('/webdav') && pathname !== '/api/rooms') {
    if (next) next();
    return;
  }

  // Common CORS and Cache-Control headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, MKCOL, MOVE, PROPFIND, OPTIONS, HEAD');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Depth, Destination, Accept, Authorization, Cache-Control, Pragma, X-Requested-With, Overwrite, If, Lock-Token'
  );
  res.setHeader('Access-Control-Expose-Headers', 'DAV, Location, Content-Type, Depth');
  res.setHeader('DAV', '1, 2');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Handle /api/rooms
  if (pathname === '/api/rooms') {
    (async () => {
      try {
        await initStorage();
        const roomsDir = path.join(STORAGE_DIR, 'rooms');
        const files = await fs.readdir(roomsDir, { withFileTypes: true });
        const roomsList = [];

        for (const file of files) {
          if (!file.isDirectory() || file.name.startsWith('.')) continue;
          const roomId = file.name;
          const roomDir = path.join(roomsDir, roomId);

          let phase = 'WAITING';
          let hostId = '';
          const stateFile = path.join(roomDir, 'state.json');
          if (existsSync(stateFile)) {
            try {
              const raw = await fs.readFile(stateFile, 'utf-8');
              const state = JSON.parse(raw);
              phase = state.phase || 'WAITING';
              hostId = state.hostId || '';
            } catch {
              // ignore
            }
          }

          let playerCount = 0;
          try {
            const roomFiles = await fs.readdir(roomDir);
            playerCount = roomFiles.filter(
              (f) => f.startsWith('user_') && f.endsWith('.json')
            ).length;
          } catch {
            // ignore
          }

          roomsList.push({
            id: roomId,
            name: roomId.replace(/^room_/, '방 '),
            playerCount,
            phase,
            hostId,
          });
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(roomsList));
      } catch (err) {
        console.error('API /api/rooms error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(err) }));
      }
    })();
    return;
  }

  // Handle /webdav and /webdav/*
  (async () => {
    await initStorage();
    const targetPath = resolveWebdavPath(pathname);
    const method = (req.method || 'GET').toUpperCase();

    try {
      if (method === 'MKCOL') {
        if (existsSync(targetPath)) {
          res.statusCode = 405;
          res.end('Collection already exists');
          return;
        }
        await fs.mkdir(targetPath, { recursive: true });
        res.statusCode = 201;
        res.end('Collection created');
        return;
      }

      if (method === 'PUT') {
        const parentDir = path.dirname(targetPath);
        if (!existsSync(parentDir)) {
          await fs.mkdir(parentDir, { recursive: true });
        }
        const bodyContent = await getRequestBody(req);
        await fs.writeFile(targetPath, bodyContent);
        res.statusCode = 201;
        res.end('File created/updated');
        return;
      }

      if (method === 'GET') {
        if (!existsSync(targetPath)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
          const items = await fs.readdir(targetPath);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ directory: pathname, items }));
          return;
        }
        const content = await fs.readFile(targetPath);
        if (targetPath.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        } else {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        }
        res.end(content);
        return;
      }

      if (method === 'MOVE') {
        const destHeader = (req.headers['destination'] as string) || '';
        if (!destHeader) {
          res.statusCode = 400;
          res.end('Destination header required');
          return;
        }
        let destUrlPath = destHeader;
        try {
          const parsed = new URL(destHeader, 'http://localhost');
          destUrlPath = parsed.pathname;
        } catch {
          // relative
        }
        const destDiskPath = resolveWebdavPath(destUrlPath);
        if (!existsSync(targetPath)) {
          res.statusCode = 404;
          res.end('Source not found');
          return;
        }
        const destParent = path.dirname(destDiskPath);
        if (!existsSync(destParent)) {
          await fs.mkdir(destParent, { recursive: true });
        }
        await fs.rename(targetPath, destDiskPath);
        res.statusCode = 201;
        res.end('Moved');
        return;
      }

      if (method === 'DELETE') {
        if (!existsSync(targetPath)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        await fs.rm(targetPath, { recursive: true, force: true });
        res.statusCode = 204;
        res.end();
        return;
      }

      if (method === 'PROPFIND') {
        if (!existsSync(targetPath)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const stat = await fs.stat(targetPath);
        const depth = (req.headers['depth'] as string) || '1';
        const responses: Array<{ href: string; name: string; isDir: boolean; size: number }> = [];

        const selfUrl = pathname.endsWith('/') ? pathname : `${pathname}/`;
        responses.push({
          href: selfUrl,
          name: path.basename(targetPath) || '',
          isDir: stat.isDirectory(),
          size: stat.size,
        });

        if (stat.isDirectory() && depth !== '0') {
          const files = await fs.readdir(targetPath, { withFileTypes: true });
          for (const file of files) {
            if (file.name.startsWith('.')) continue;
            const filePath = path.join(targetPath, file.name);
            const fileStat = await fs.stat(filePath);
            const itemUrl = `${selfUrl}${file.name}${file.isDirectory() ? '/' : ''}`;
            responses.push({
              href: itemUrl,
              name: file.name,
              isDir: file.isDirectory(),
              size: fileStat.size,
            });
          }
        }

        const acceptHeader = (req.headers['accept'] as string) || '';
        if (acceptHeader.includes('application/json')) {
          res.statusCode = 207;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(responses));
          return;
        }

        let xml = '<?xml version="1.0" encoding="utf-8" ?>\n';
        xml += '<D:multistatus xmlns:D="DAV:">\n';
        for (const item of responses) {
          xml += '  <D:response>\n';
          xml += `    <D:href>${item.href}</D:href>\n`;
          xml += '    <D:propstat>\n';
          xml += '      <D:prop>\n';
          xml += `        <D:displayname>${item.name}</D:displayname>\n`;
          if (item.isDir) {
            xml += '        <D:resourcetype><D:collection/></D:resourcetype>\n';
          } else {
            xml += '        <D:resourcetype/>\n';
            xml += `        <D:getcontentlength>${item.size}</D:getcontentlength>\n`;
          }
          xml += '      </D:prop>\n';
          xml += '      <D:status>HTTP/1.1 200 OK</D:status>\n';
          xml += '    </D:propstat>\n';
          xml += '  </D:response>\n';
        }
        xml += '</D:multistatus>';

        res.statusCode = 207;
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.end(xml);
        return;
      }

      res.statusCode = 405;
      res.end(`Method ${method} not allowed`);
    } catch (err: unknown) {
      console.error('WebDAV Error:', err);
      res.statusCode = 500;
      res.end(`WebDAV Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
}

// Vite plugin to embed WebDAV and /api/rooms in dev and preview server
export function viteWebdavPlugin(): Plugin {
  return {
    name: 'vite-plugin-webdav-backend',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        webdavConnectMiddleware(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        webdavConnectMiddleware(req, res, next);
      });
    },
  };
}
