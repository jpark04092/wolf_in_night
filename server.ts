import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { webdavConnectMiddleware, initStorage } from './src/server/webdavMiddleware';

const PORT = 3000;

async function startServer() {
  await initStorage();
  const app = express();

  // Raw body parser for WebDAV PUT requests (supports JSON, text, xml)
  app.use('/webdav', express.raw({ type: '*/*', limit: '10mb' }));

  // Shared WebDAV and /api/rooms handler
  app.use(webdavConnectMiddleware);

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
