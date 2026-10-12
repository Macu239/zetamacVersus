import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  DEFAULT_SETTINGS,
  cloneSettings,
  generateProblem,
  validateSettings,
  type ClientToServerEvents,
  type FinishedPayload,
  type GameSettings,
  type Phase,
  type Problem,
  type ProblemPayload,
  type Rng,
  type RoomState,
  type ServerToClientEvents,
} from '@zv/shared';

/** Per-socket data: which room and player this connection belongs to. */
export interface SocketData {
  roomCode?: string;
  playerId?: string;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Tunable timings, overridable in tests. */
export interface RoomOptions {
  countdownMs: number;
  reconnectGraceMs: number;
  /** Overrides the settings duration (tests only). */
  durationMsOverride?: number;
  rng: Rng;
}

export const MAX_PLAYERS = 2;

type Timer = ReturnType<typeof setTimeout>;

interface Player {
  id: string;
  sessionId: string;
  nickname: string;
  socketId: string | null;
  ready: boolean;
  score: number;
  wantsRematch: boolean;
  solveTimes: number[];
  graceTimer: Timer | null;
}

/**
 * One versus room. The server owns all game state: problems, answers, scores and the clock.
 */
export class Room {
  hostId = '';
  phase: Phase = 'lobby';
  settings: GameSettings = cloneSettings(DEFAULT_SETTINGS);
  players: Player[] = [];
  lastActivity = Date.now();

  private problem: Problem | null = null;
  private problemCounter = 0;
  private problemShownAt = 0;
  private endsAt = 0;
  private remainingMs = 0;
  private pausedUntil = 0;
  private countdownEndsAt = 0;
  private countdownTimer: Timer | null = null;
  private finishTimer: Timer | null = null;
  private lastFinished: FinishedPayload | null = null;

  /**
   * @param code - Room code.
   * @param io - Socket.IO server used for broadcasts.
   * @param options - Timing options.
   * @param onEmpty - Called when the last player leaves.
   */
  constructor(
    readonly code: string,
    private readonly io: GameServer,
    private readonly options: RoomOptions,
    private readonly onEmpty: (code: string) => void,
  ) {}

  /**
   * Whether the room has no free seats.
   * @returns True when the room is full.
   */
  isFull(): boolean {
    return this.players.length >= MAX_PLAYERS;
  }

  /**
   * Finds a player by their private session id.
   * @param sessionId - Session id from the client.
   * @returns The player, if any.
   */
  findBySession(sessionId: string): Player | undefined {
    return this.players.find((p) => p.sessionId === sessionId);
  }

  /**
   * Finds a player by public id.
   * @param playerId - Public player id.
   * @returns The player, if any.
   */
  findById(playerId: string): Player | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  /**
   * Adds a new player and binds their socket. The first player becomes host.
   * @param sessionId - Private session id used for reconnects.
   * @param nickname - Display name.
   * @param socket - The player's socket.
   * @returns The new player.
   */
  addPlayer(sessionId: string, nickname: string, socket: GameSocket): Player {
    const player: Player = {
      id: randomUUID().slice(0, 8),
      sessionId,
      nickname,
      socketId: null,
      ready: false,
      score: 0,
      wantsRematch: false,
      solveTimes: [],
      graceTimer: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    for (const p of this.players) p.ready = false;
    this.attach(player, socket);
    this.touch();
    this.broadcastState();
    return player;
  }

  /**
   * Rebinds a returning player to a new socket and resumes a paused game when possible.
   * @param player - The returning player.
   * @param socket - Their new socket.
   */
  reconnect(player: Player, socket: GameSocket): void {
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = null;
    if (player.socketId && player.socketId !== socket.id) {
      const old = this.io.sockets.sockets.get(player.socketId);
      if (old) {
        old.leave(this.code);
        old.data = {};
        old.emit('room:kicked', { message: 'This game was opened in another tab.' });
      }
    }
    this.attach(player, socket);
    this.touch();
    if (this.phase === 'paused' && this.players.every((p) => p.socketId)) {
      this.resume();
    } else {
      this.sendSnapshot(socket);
    }
    this.broadcastState();
  }

  /**
   * Handles a socket disconnect: pauses or cancels a game and starts the reconnect window.
   * @param socketId - The socket that disconnected.
   */
  handleDisconnect(socketId: string): void {
    const player = this.players.find((p) => p.socketId === socketId);
    if (!player) return;
    player.socketId = null;
    if (this.phase === 'countdown') this.cancelCountdown();
    else if (this.phase === 'playing') this.pause();
    player.graceTimer = setTimeout(() => {
      this.emitTo(player, 'room:kicked', { message: 'You were away too long.' });
      this.removePlayer(player.id);
    }, this.options.reconnectGraceMs);
    this.broadcastState();
  }

  /**
   * Removes a player for good. Leaving a running game forfeits it.
   * @param playerId - Player to remove.
   */
  removePlayer(playerId: string): void {
    const player = this.findById(playerId);
    if (!player) return;
    if (player.graceTimer) clearTimeout(player.graceTimer);
    if (player.socketId) {
      const socket = this.io.sockets.sockets.get(player.socketId);
      if (socket) {
        socket.leave(this.code);
        socket.data = {};
      }
    }
    if (this.phase === 'playing' || this.phase === 'paused') this.finish('forfeit', player.id);
    else if (this.phase === 'countdown') this.cancelCountdown();

    this.players = this.players.filter((p) => p.id !== playerId);
    if (this.players.length === 0) {
      this.destroy();
      this.onEmpty(this.code);
      return;
    }
    if (this.hostId === playerId) this.hostId = this.players[0].id;
    for (const p of this.players) p.ready = false;
    if (this.phase === 'finished') this.maybeRematch();
    this.broadcastState();
  }

  /**
   * Applies new settings from the host while in the lobby.
   * @param playerId - Player requesting the change.
   * @param raw - Untrusted settings input.
   */
  updateSettings(playerId: string, raw: unknown): void {
    const player = this.findById(playerId);
    if (!player) return;
    if (playerId !== this.hostId) return this.emitTo(player, 'room:error', { message: 'Only the host can change settings.' });
    if (this.phase !== 'lobby') return this.emitTo(player, 'room:error', { message: 'Settings can only change in the lobby.' });
    const result = validateSettings(raw);
    if (!result.ok) return this.emitTo(player, 'room:error', { message: result.error });
    this.settings = result.settings;
    for (const p of this.players) p.ready = false;
    this.touch();
    this.broadcastState();
  }

  /**
   * Toggles a player's ready flag and starts the countdown when both are ready.
   * @param playerId - Player toggling ready.
   * @param ready - New ready state.
   */
  setReady(playerId: string, ready: boolean): void {
    const player = this.findById(playerId);
    if (!player || this.phase !== 'lobby') return;
    player.ready = ready === true;
    this.touch();
    if (this.players.length === MAX_PLAYERS && this.players.every((p) => p.ready && p.socketId)) {
      this.startCountdown();
    }
    this.broadcastState();
  }

  /**
   * Checks an answer attempt. The first correct answer for the current problem scores.
   * @param playerId - Player answering.
   * @param problemId - Problem the client believes is current.
   * @param value - Raw input text.
   */
  attempt(playerId: string, problemId: unknown, value: unknown): void {
    const problem = this.problem;
    if (this.phase !== 'playing' || !problem || problemId !== problem.id) return;
    if (typeof value !== 'string' || value.length > 12) return;
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed) || Number(trimmed) !== problem.answer) return;
    const player = this.findById(playerId);
    if (!player) return;

    player.score += 1;
    player.solveTimes.push(Date.now() - this.problemShownAt);
    this.touch();
    this.io.to(this.code).emit('game:point', {
      problemId: problem.id,
      playerId: player.id,
      answer: problem.answer,
      scores: this.scores(),
    });
    this.nextProblem();
  }

  /**
   * Records a rematch vote. When every player has voted, the room returns to the lobby.
   * @param playerId - Player voting.
   */
  rematch(playerId: string): void {
    const player = this.findById(playerId);
    if (!player || this.phase !== 'finished') return;
    player.wantsRematch = true;
    this.touch();
    this.maybeRematch();
    this.broadcastState();
  }

  /** Clears every timer. Call before discarding the room. */
  destroy(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    if (this.finishTimer) clearTimeout(this.finishTimer);
    for (const p of this.players) if (p.graceTimer) clearTimeout(p.graceTimer);
    this.countdownTimer = null;
    this.finishTimer = null;
  }

  /**
   * Builds the public room snapshot.
   * @returns The room state sent to clients.
   */
  toState(): RoomState {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        ready: p.ready,
        connected: p.socketId !== null,
        score: p.score,
        wantsRematch: p.wantsRematch,
      })),
      pauseRemainingMs: this.phase === 'paused' ? Math.max(0, this.pausedUntil - Date.now()) : null,
    };
  }

  /** Sends the current snapshot to everyone in the room. */
  broadcastState(): void {
    this.io.to(this.code).emit('room:state', this.toState());
  }

  /**
   * Binds a socket to a player and joins the Socket.IO room.
   * @param player - Player to bind.
   * @param socket - Socket to bind.
   */
  private attach(player: Player, socket: GameSocket): void {
    player.socketId = socket.id;
    socket.join(this.code);
    socket.data.roomCode = this.code;
    socket.data.playerId = player.id;
  }

  /**
   * Sends phase-specific state to a socket that just (re)joined.
   * @param socket - Target socket.
   */
  private sendSnapshot(socket: GameSocket): void {
    if (this.phase === 'countdown') {
      socket.emit('game:countdown', { startsInMs: Math.max(0, this.countdownEndsAt - Date.now()) });
    } else if (this.phase === 'playing' && this.problem) {
      socket.emit('game:problem', this.problemPayload());
    } else if (this.phase === 'finished' && this.lastFinished) {
      socket.emit('game:finished', this.lastFinished);
    }
  }

  /**
   * Emits an event to one player's socket, if connected.
   * @param player - Recipient.
   * @param event - Event name.
   * @param payload - Event payload.
   */
  private emitTo(player: Player, event: 'room:error' | 'room:kicked', payload: { message: string }): void {
    if (!player.socketId) return;
    this.io.sockets.sockets.get(player.socketId)?.emit(event, payload);
  }

  /** Marks the room as recently active. */
  private touch(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Current scores keyed by player id.
   * @returns Score map.
   */
  private scores(): Record<string, number> {
    return Object.fromEntries(this.players.map((p) => [p.id, p.score]));
  }

  /** Enters the 3-2-1 countdown. */
  private startCountdown(): void {
    this.phase = 'countdown';
    this.countdownEndsAt = Date.now() + this.options.countdownMs;
    this.io.to(this.code).emit('game:countdown', { startsInMs: this.options.countdownMs });
    this.countdownTimer = setTimeout(() => this.startGame(), this.options.countdownMs);
  }

  /** Aborts the countdown and returns to the lobby. */
  private cancelCountdown(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
    this.phase = 'lobby';
    for (const p of this.players) p.ready = false;
  }

  /** Resets scores, starts the clock and deals the first problem. */
  private startGame(): void {
    this.countdownTimer = null;
    this.phase = 'playing';
    this.lastFinished = null;
    for (const p of this.players) {
      p.score = 0;
      p.solveTimes = [];
      p.wantsRematch = false;
    }
    const durationMs = this.options.durationMsOverride ?? this.settings.durationSec * 1000;
    this.endsAt = Date.now() + durationMs;
    this.finishTimer = setTimeout(() => this.finish('time'), durationMs);
    this.broadcastState();
    this.nextProblem();
  }

  /** Deals a new shared problem to both players. */
  private nextProblem(): void {
    this.problem = generateProblem(this.settings, ++this.problemCounter, this.options.rng, this.problem?.text);
    this.problemShownAt = Date.now();
    this.io.to(this.code).emit('game:problem', this.problemPayload());
  }

  /**
   * The current problem without its answer.
   * @returns Problem payload for clients.
   */
  private problemPayload(): ProblemPayload {
    const problem = this.problem as Problem;
    return { id: problem.id, text: problem.text, remainingMs: Math.max(0, this.endsAt - Date.now()) };
  }

  /** Freezes the clock while a player is disconnected. */
  private pause(): void {
    this.remainingMs = Math.max(0, this.endsAt - Date.now());
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    this.phase = 'paused';
    this.pausedUntil = Date.now() + this.options.reconnectGraceMs;
  }

  /** Restarts the clock once both players are back, re-sending the current problem. */
  private resume(): void {
    this.phase = 'playing';
    this.endsAt = Date.now() + this.remainingMs;
    this.finishTimer = setTimeout(() => this.finish('time'), this.remainingMs);
    this.problemShownAt = Date.now();
    if (this.problem) this.io.to(this.code).emit('game:problem', this.problemPayload());
  }

  /**
   * Ends the game and sends results.
   * @param reason - Why the game ended.
   * @param forfeiterId - Player who left, for forfeits.
   */
  private finish(reason: 'time' | 'forfeit', forfeiterId?: string): void {
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    this.phase = 'finished';
    this.problem = null;

    let winnerId: string | null = null;
    if (reason === 'forfeit') {
      winnerId = this.players.find((p) => p.id !== forfeiterId)?.id ?? null;
    } else if (this.players.length === MAX_PLAYERS) {
      const [a, b] = this.players;
      if (a.score !== b.score) winnerId = a.score > b.score ? a.id : b.id;
    }

    const payload: FinishedPayload = {
      reason,
      winnerId,
      stats: this.players.map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        score: p.score,
        avgSolveMs: p.solveTimes.length ? Math.round(p.solveTimes.reduce((s, t) => s + t, 0) / p.solveTimes.length) : null,
        fastestSolveMs: p.solveTimes.length ? Math.min(...p.solveTimes) : null,
      })),
    };
    this.lastFinished = payload;
    for (const p of this.players) {
      p.ready = false;
      p.wantsRematch = false;
    }
    this.io.to(this.code).emit('game:finished', payload);
    this.broadcastState();
  }

  /** Returns to the lobby once every remaining player wants a rematch. */
  private maybeRematch(): void {
    if (this.players.length === 0 || !this.players.every((p) => p.wantsRematch)) return;
    this.phase = 'lobby';
    this.lastFinished = null;
    for (const p of this.players) {
      p.ready = false;
      p.wantsRematch = false;
      p.score = 0;
    }
  }
}
