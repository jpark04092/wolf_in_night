import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const STORAGE_DIR = path.resolve(process.cwd(), 'webdav_storage');

// Helper to normalize webdav url path to disk path
function resolveWebdavPath(urlPath: string): string {
  // Strip query string
  const cleanPath = urlPath.split('?')[0];
  // Strip /webdav/ prefix
  const relative = cleanPath.replace(/^\/webdav(\/|$)/, '');
  // Sanitize path to prevent directory traversal
  const safeRelative = path.normalize(relative).replace(/^(\.\.[\/\\])+/, '');
  return path.join(STORAGE_DIR, safeRelative);
}

// Ensure base rooms folder exists
async function initStorage() {
  const roomsDir = path.join(STORAGE_DIR, 'rooms');
  if (!existsSync(roomsDir)) {
    await fs.mkdir(roomsDir, { recursive: true });
  }
}

async function startServer() {
  await initStorage();
  const app = express();

  // Raw body parser for WebDAV PUT requests (supports JSON, text, xml)
  app.use('/webdav', express.raw({ type: '*/*', limit: '10mb' }));

  // CORS Middleware for WebDAV
  app.use('/webdav', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, MKCOL, MOVE, PROPFIND, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Depth, Destination');
    res.header('Access-Control-Expose-Headers', 'DAV, Location');
    res.header('DAV', '1, 2');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // WebDAV Handlers
  app.all('/webdav/*', async (req, res) => {
    const targetPath = resolveWebdavPath(req.path);
    const method = req.method.toUpperCase();

    try {
      if (method === 'MKCOL') {
        if (existsSync(targetPath)) {
          res.status(405).send('Collection already exists');
          return;
        }
        await fs.mkdir(targetPath, { recursive: true });
        res.status(201).send('Collection created');
        return;
      }

      if (method === 'PUT') {
        const parentDir = path.dirname(targetPath);
        if (!existsSync(parentDir)) {
          await fs.mkdir(parentDir, { recursive: true });
        }
        const bodyContent = req.body instanceof Buffer ? req.body : Buffer.from(req.body || '');
        await fs.writeFile(targetPath, bodyContent);
        res.status(201).send('File created/updated');
        return;
      }

      if (method === 'GET') {
        if (!existsSync(targetPath)) {
          res.status(404).send('Not found');
          return;
        }
        const stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
          // If a directory is requested via GET, return list of files as JSON for convenience
          const items = await fs.readdir(targetPath);
          res.json({ directory: req.path, items });
          return;
        }
        const content = await fs.readFile(targetPath);
        if (targetPath.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        } else {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        }
        res.send(content);
        return;
      }

      if (method === 'MOVE') {
        const destHeader = req.headers['destination'] as string;
        if (!destHeader) {
          res.status(400).send('Destination header required');
          return;
        }
        let destUrlPath = destHeader;
        try {
          // If Destination is absolute URL e.g. http://localhost:3000/webdav/rooms/room_101/temp.json
          const parsed = new URL(destHeader, 'http://localhost');
          destUrlPath = parsed.pathname;
        } catch {
          // Already a relative path
        }
        const destDiskPath = resolveWebdavPath(destUrlPath);
        if (!existsSync(targetPath)) {
          res.status(404).send('Source not found');
          return;
        }
        const destParent = path.dirname(destDiskPath);
        if (!existsSync(destParent)) {
          await fs.mkdir(destParent, { recursive: true });
        }
        await fs.rename(targetPath, destDiskPath);
        res.status(201).send('Moved');
        return;
      }

      if (method === 'DELETE') {
        if (!existsSync(targetPath)) {
          res.status(404).send('Not found');
          return;
        }
        await fs.rm(targetPath, { recursive: true, force: true });
        res.status(204).end();
        return;
      }

      if (method === 'PROPFIND') {
        if (!existsSync(targetPath)) {
          res.status(404).send('Not found');
          return;
        }
        const stat = await fs.stat(targetPath);
        const depth = req.headers['depth'] || '1';

        const responses: Array<{ href: string; name: string; isDir: boolean; size: number }> = [];

        // Add self
        const selfUrl = req.path.endsWith('/') ? req.path : `${req.path}/`;
        responses.push({
          href: selfUrl,
          name: path.basename(targetPath) || '',
          isDir: stat.isDirectory(),
          size: stat.size,
        });

        if (stat.isDirectory() && depth !== '0') {
          const files = await fs.readdir(targetPath, { withFileTypes: true });
          for (const file of files) {
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

        // Support JSON response if requested via header, or return standard WebDAV 207 Multi-Status XML
        const acceptHeader = req.headers['accept'] || '';
        if (acceptHeader.includes('application/json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.status(207).json(responses);
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

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.status(207).send(xml);
        return;
      }

      res.status(405).send(`Method ${method} not allowed`);
    } catch (err: unknown) {
      console.error('WebDAV Error:', err);
      res.status(500).send(`WebDAV Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // Vite middleware in dev or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`One Night Werewolf WebDAV Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
