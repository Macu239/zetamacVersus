import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const here = path.dirname(fileURLToPath(import.meta.url));

const { httpServer } = createApp({
  staticDir: path.resolve(here, '../../client/dist'),
  corsOrigin: process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean),
});

httpServer.listen(port, host, () => {
  console.log(`Zetamac Versus server listening on http://${host}:${port}`);
});
