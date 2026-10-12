import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@zv/shared';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Shared socket. Same-origin by default; set VITE_SERVER_URL to point at a separate server. */
export const socket: ClientSocket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  transports: ['websocket', 'polling'],
});
