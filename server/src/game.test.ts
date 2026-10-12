import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  FinishedPayload,
  JoinResult,
  PointPayload,
  ProblemPayload,
  RoomState,
  ServerToClientEvents,
} from '@zv/shared';
import { createApp, type AppOptions } from './app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let app: ReturnType<typeof createApp>;
let url = '';
const clients: Client[] = [];

/**
 * Starts a server on a random port with fast timings.
 * @param overrides - Option overrides.
 */
async function start(overrides: AppOptions = {}): Promise<void> {
  app = createApp({ countdownMs: 30, reconnectGraceMs: 300, durationMsOverride: 2000, ...overrides });
  await new Promise<void>((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
}

/**
 * Opens a connected client.
 * @returns The connected socket.
 */
async function client(): Promise<Client> {
  const socket: Client = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(socket);
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  return socket;
}

/**
 * Waits for the next occurrence of an event, optionally matching a predicate.
 * @param socket - Client socket.
 * @param event - Event name.
 * @param match - Optional filter.
 * @returns The event payload.
 */
function next<E extends keyof ServerToClientEvents>(
  socket: Client,
  event: E,
  match: (p: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 4000);
    const handler = (payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      (socket.off as (e: string, h: unknown) => void)(event, handler);
      resolve(payload);
    };
    (socket.on as (e: string, h: unknown) => void)(event, handler);
  });
}

/**
 * Computes the answer for a problem string.
 * @param text - Problem text like "12 + 7".
 * @returns The correct answer.
 */
function solve(text: string): number {
  const [a, op, b] = text.split(' ');
  const x = Number(a);
  const y = Number(b);
  if (op === '+') return x + y;
  if (op === '−') return x - y;
  if (op === '×') return x * y;
  return x / y;
}

/**
 * Creates a room with two players and starts a game.
 * @returns Both sockets, their ids, and the first problem each saw.
 */
async function startedGame() {
  const a = await client();
  const b = await client();
  const created = await a.emitWithAck('room:create', { nickname: 'Alice', sessionId: 'session-alice' });
  if (!created.ok) throw new Error(created.error);
  const joined = await b.emitWithAck('room:join', { code: created.code.toLowerCase(), nickname: 'Bob', sessionId: 'session-bob' });
  if (!joined.ok) throw new Error(joined.error);

  const pa = next(a, 'game:problem');
  const pb = next(b, 'game:problem');
  a.emit('player:ready', true);
  b.emit('player:ready', true);
  const [problemA, problemB] = await Promise.all([pa, pb]);
  return { a, b, code: created.code, aId: created.playerId, bId: (joined as JoinResult).playerId, problemA, problemB };
}

beforeEach(async () => {
  await start();
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await app.close();
});

describe('versus game', () => {
  it('deals the identical problem to both players', async () => {
    const { problemA, problemB } = await startedGame();
    expect(problemA.id).toBe(problemB.id);
    expect(problemA.text).toBe(problemB.text);
  });

  it('awards exactly one point when both answer at the same time', async () => {
    const { a, b, problemA } = await startedGame();
    const points: PointPayload[] = [];
    a.on('game:point', (p) => points.push(p));
    const nextProblem = next(a, 'game:problem', (p) => p.id === problemA.id + 1);
    const value = String(solve(problemA.text));
    a.emit('answer:attempt', { problemId: problemA.id, value });
    b.emit('answer:attempt', { problemId: problemA.id, value });
    const second: ProblemPayload = await nextProblem;
    await new Promise((r) => setTimeout(r, 100));
    expect(points.filter((p) => p.problemId === problemA.id)).toHaveLength(1);
    expect(Object.values(points[0].scores).reduce((s, n) => s + n, 0)).toBe(1);
    expect(second.id).toBe(problemA.id + 1);
  });

  it('ignores wrong answers and stale problem ids', async () => {
    const { a, b, problemA, bId } = await startedGame();
    const points: PointPayload[] = [];
    a.on('game:point', (p) => points.push(p));
    a.emit('answer:attempt', { problemId: problemA.id, value: String(solve(problemA.text) + 1) });
    await new Promise((r) => setTimeout(r, 80));
    expect(points).toHaveLength(0);

    const nextProblem = next(a, 'game:problem', (p) => p.id === problemA.id + 1);
    b.emit('answer:attempt', { problemId: problemA.id, value: String(solve(problemA.text)) });
    await nextProblem;
    a.emit('answer:attempt', { problemId: problemA.id, value: String(solve(problemA.text)) });
    await new Promise((r) => setTimeout(r, 80));
    expect(points).toHaveLength(1);
    expect(points[0].playerId).toBe(bId);
  });

  it('finishes when the clock runs out and reports the winner', async () => {
    const { a, b, problemA, aId } = await startedGame();
    const finished = next(a, 'game:finished');
    a.emit('answer:attempt', { problemId: problemA.id, value: String(solve(problemA.text)) });
    const result: FinishedPayload = await finished;
    expect(result.reason).toBe('time');
    expect(result.winnerId).toBe(aId);
    expect(result.stats.find((s) => s.playerId === aId)?.score).toBe(1);

    const lobbyA = next(a, 'room:state', (s) => s.phase === 'lobby');
    a.emit('game:rematch');
    b.emit('game:rematch');
    const lobby: RoomState = await lobbyA;
    expect(lobby.players.every((p) => p.score === 0 && !p.ready)).toBe(true);
  });

  it('rejects a third player', async () => {
    const { code } = await startedGame();
    const c = await client();
    const res = await c.emitWithAck('room:join', { code, nickname: 'Eve', sessionId: 'session-eve' });
    expect(res.ok).toBe(false);
  });

  it('pauses on disconnect, resumes on reconnect, and forfeits after the grace period', async () => {
    const { a, b, code, aId } = await startedGame();
    const paused = next(a, 'room:state', (s) => s.phase === 'paused');
    b.disconnect();
    expect((await paused).pauseRemainingMs).toBeGreaterThan(0);

    const b2 = await client();
    const resumed = next(a, 'room:state', (s) => s.phase === 'playing');
    const res = await b2.emitWithAck('room:resume', { code, sessionId: 'session-bob' });
    expect(res.ok).toBe(true);
    await resumed;

    const finished = next(a, 'game:finished');
    b2.disconnect();
    const result = await finished;
    expect(result.reason).toBe('forfeit');
    expect(result.winnerId).toBe(aId);
  });

  it('rejects invalid settings and non-host changes', async () => {
    const a = await client();
    const b = await client();
    const created = await a.emitWithAck('room:create', { nickname: 'Alice', sessionId: 'session-alice' });
    if (!created.ok) throw new Error(created.error);
    await b.emitWithAck('room:join', { code: created.code, nickname: 'Bob', sessionId: 'session-bob' });

    const err = next(a, 'room:error');
    a.emit('settings:update', { durationSec: 1 } as never);
    expect((await err).message).toMatch(/Duration/);

    const errB = next(b, 'room:error');
    const state = await new Promise<RoomState>((resolve) => {
      a.once('room:state', resolve);
      a.emit('player:ready', false);
    });
    b.emit('settings:update', state.settings);
    expect((await errB).message).toMatch(/host/);
  });
});
