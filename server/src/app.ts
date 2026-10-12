import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type { GameServer } from './game';
import { registerHandlers } from './handlers';
import { RoomManager, type RoomManagerOptions } from './rooms';

export interface AppOptions extends Partial<RoomManagerOptions> {
  /** Built client directory to serve, if present. */
  staticDir?: string;
  /** Allowed CORS origins for Socket.IO. Defaults to reflecting the request origin. */
  corsOrigin?: string[];
}

/**
 * Builds the HTTP server, Socket.IO server and room registry without listening.
 * @param options - Static dir, CORS and timing overrides.
 * @returns Handles to the servers plus a close function.
 */
export function createApp(options: AppOptions = {}) {
  const app = express();
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  const { staticDir } = options;
  if (staticDir && existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  const httpServer = createServer(app);
  const io: GameServer = new Server(httpServer, {
    cors: { origin: options.corsOrigin && options.corsOrigin.length ? options.corsOrigin : true },
  });

  const manager = new RoomManager(io, {
    countdownMs: options.countdownMs ?? 3000,
    reconnectGraceMs: options.reconnectGraceMs ?? 30_000,
    durationMsOverride: options.durationMsOverride,
    rng: options.rng ?? Math.random,
    idleMs: options.idleMs ?? 30 * 60_000,
    sweepIntervalMs: options.sweepIntervalMs ?? 60_000,
  });
  registerHandlers(io, manager);

  /**
   * Shuts down rooms, sockets and the HTTP server.
   * @returns Resolves once closed.
   */
  const close = (): Promise<void> =>
    new Promise((resolve) => {
      manager.close();
      io.close(() => resolve());
    });

  return { app, httpServer, io, manager, close };
}
