import type { Ack, JoinResult } from '@zv/shared';
import type { GameServer, GameSocket, Room } from './game';
import { normalizeCode, type RoomManager } from './rooms';

const MAX_NICKNAME = 16;

/**
 * Cleans a display name.
 * @param raw - Untrusted input.
 * @returns A trimmed nickname, or "Player" when empty.
 */
export function sanitizeNickname(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NICKNAME) : '';
  return name || 'Player';
}

/**
 * Checks that a session id looks like one the client generated.
 * @param raw - Untrusted input.
 * @returns The session id, or null when invalid.
 */
function readSessionId(raw: unknown): string | null {
  return typeof raw === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw : null;
}

/**
 * Wraps an untrusted ack so a missing or non-function callback cannot crash the handler.
 * @param ack - Callback from the client.
 * @returns A safe callback.
 */
function safeAck(ack: unknown): Ack<JoinResult> {
  return typeof ack === 'function' ? (ack as Ack<JoinResult>) : () => {};
}

/**
 * Finds the room and player this socket is bound to.
 * @param socket - Client socket.
 * @param manager - Room registry.
 * @returns The room and player id, or null.
 */
function context(socket: GameSocket, manager: RoomManager): { room: Room; playerId: string } | null {
  const room = manager.get(socket.data.roomCode);
  const playerId = socket.data.playerId;
  return room && playerId ? { room, playerId } : null;
}

/**
 * Removes the socket's player from any room it is currently in.
 * @param socket - Client socket.
 * @param manager - Room registry.
 */
function leaveCurrentRoom(socket: GameSocket, manager: RoomManager): void {
  const ctx = context(socket, manager);
  if (ctx) ctx.room.removePlayer(ctx.playerId);
  socket.data = {};
}

/**
 * Wires every client event to the room logic.
 * @param io - Socket.IO server.
 * @param manager - Room registry.
 */
export function registerHandlers(io: GameServer, manager: RoomManager): void {
  io.on('connection', (socket) => {
    socket.on('room:create', (payload, rawAck) => {
      const ack = safeAck(rawAck);
      const sessionId = readSessionId(payload?.sessionId);
      if (!sessionId) return ack({ ok: false, error: 'Invalid session. Refresh the page.' });
      leaveCurrentRoom(socket, manager);
      const room = manager.create();
      const player = room.addPlayer(sessionId, sanitizeNickname(payload?.nickname), socket);
      ack({ ok: true, code: room.code, playerId: player.id });
    });

    socket.on('room:join', (payload, rawAck) => {
      const ack = safeAck(rawAck);
      const sessionId = readSessionId(payload?.sessionId);
      if (!sessionId) return ack({ ok: false, error: 'Invalid session. Refresh the page.' });
      const code = normalizeCode(payload?.code);
      const room = manager.get(code);
      if (!room) return ack({ ok: false, error: `No room found with code ${code || '(empty)'}.` });

      const existing = room.findBySession(sessionId);
      if (existing) {
        ack({ ok: true, code: room.code, playerId: existing.id });
        return room.reconnect(existing, socket);
      }
      if (room.isFull()) return ack({ ok: false, error: 'That room is full.' });
      if (room.phase !== 'lobby') return ack({ ok: false, error: 'That game has already started.' });

      leaveCurrentRoom(socket, manager);
      const player = room.addPlayer(sessionId, sanitizeNickname(payload?.nickname), socket);
      ack({ ok: true, code: room.code, playerId: player.id });
    });

    socket.on('room:resume', (payload, rawAck) => {
      const ack = safeAck(rawAck);
      const sessionId = readSessionId(payload?.sessionId);
      const room = manager.get(normalizeCode(payload?.code));
      const player = sessionId ? room?.findBySession(sessionId) : undefined;
      if (!room || !player) return ack({ ok: false, error: 'That room is no longer available.' });
      ack({ ok: true, code: room.code, playerId: player.id });
      room.reconnect(player, socket);
    });

    socket.on('room:leave', () => leaveCurrentRoom(socket, manager));

    socket.on('settings:update', (settings) => {
      const ctx = context(socket, manager);
      ctx?.room.updateSettings(ctx.playerId, settings);
    });

    socket.on('player:ready', (ready) => {
      const ctx = context(socket, manager);
      ctx?.room.setReady(ctx.playerId, ready === true);
    });

    socket.on('answer:attempt', (payload) => {
      const ctx = context(socket, manager);
      ctx?.room.attempt(ctx.playerId, payload?.problemId, payload?.value);
    });

    socket.on('game:rematch', () => {
      const ctx = context(socket, manager);
      ctx?.room.rematch(ctx.playerId);
    });

    socket.on('disconnect', () => {
      const ctx = context(socket, manager);
      ctx?.room.handleDisconnect(socket.id);
    });
  });
}
