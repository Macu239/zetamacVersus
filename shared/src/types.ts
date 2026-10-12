/** Arithmetic operations a problem can use. */
export type Operation = 'add' | 'sub' | 'mul' | 'div';

/** An operation that owns its own operand ranges (addition and multiplication). */
export interface RangeSettings {
  enabled: boolean;
  aMin: number;
  aMax: number;
  bMin: number;
  bMax: number;
}

/** An operation that reuses another operation's ranges in reverse. */
export interface ToggleSettings {
  enabled: boolean;
}

/** Host-adjustable game configuration, modeled on Zetamac's settings page. */
export interface GameSettings {
  durationSec: number;
  addition: RangeSettings;
  /** Reverse of addition: (a + b) - a = b. */
  subtraction: ToggleSettings;
  multiplication: RangeSettings;
  /** Reverse of multiplication: (a * b) / a = b. */
  division: ToggleSettings;
}

/** A generated problem, including its answer. Only the server sees this. */
export interface Problem {
  id: number;
  op: Operation;
  text: string;
  answer: number;
}

/** Room lifecycle. */
export type Phase = 'lobby' | 'countdown' | 'playing' | 'paused' | 'finished';

/** Public view of a player in a room. */
export interface PlayerInfo {
  id: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
  score: number;
  wantsRematch: boolean;
}

/** Full room snapshot broadcast to both players whenever it changes. */
export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  players: PlayerInfo[];
  /** Milliseconds left in the reconnect window while paused, otherwise null. */
  pauseRemainingMs: number | null;
}

/** The problem both players are racing on. Durations are relative to avoid clock skew. */
export interface ProblemPayload {
  id: number;
  text: string;
  remainingMs: number;
}

/** Sent when a player answers the current problem first. */
export interface PointPayload {
  problemId: number;
  playerId: string;
  answer: number;
  scores: Record<string, number>;
}

/** End-of-game statistics for one player. */
export interface PlayerStats {
  playerId: string;
  nickname: string;
  score: number;
  avgSolveMs: number | null;
  fastestSolveMs: number | null;
}

/** Final result of a game. */
export interface FinishedPayload {
  reason: 'time' | 'forfeit';
  winnerId: string | null;
  stats: PlayerStats[];
}

/** Successful room entry. */
export interface JoinResult {
  code: string;
  playerId: string;
}

/** Acknowledgement callback used by request-style events. */
export type Ack<T> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

/** Events the client sends to the server. */
export interface ClientToServerEvents {
  'room:create': (p: { nickname: string; sessionId: string }, ack: Ack<JoinResult>) => void;
  'room:join': (p: { code: string; nickname: string; sessionId: string }, ack: Ack<JoinResult>) => void;
  'room:resume': (p: { code: string; sessionId: string }, ack: Ack<JoinResult>) => void;
  'room:leave': () => void;
  'settings:update': (settings: GameSettings) => void;
  'player:ready': (ready: boolean) => void;
  'answer:attempt': (p: { problemId: number; value: string }) => void;
  'game:rematch': () => void;
}

/** Events the server sends to clients. */
export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'room:error': (p: { message: string }) => void;
  'room:kicked': (p: { message: string }) => void;
  'game:countdown': (p: { startsInMs: number }) => void;
  'game:problem': (p: ProblemPayload) => void;
  'game:point': (p: PointPayload) => void;
  'game:finished': (p: FinishedPayload) => void;
}
