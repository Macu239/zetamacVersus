import { useCallback, useEffect, useState } from 'react';
import type { Ack, FinishedPayload, GameSettings, JoinResult, PointPayload, RoomState } from '@zv/shared';
import { socket } from './socket';
import { getSessionId, loadRoomCode, saveNickname, saveRoomCode } from './session';

export interface CurrentProblem {
  id: number;
  text: string;
}

export interface ReceivedPoint extends PointPayload {
  receivedAt: number;
}

export interface GameClient {
  connected: boolean;
  room: RoomState | null;
  playerId: string | null;
  problem: CurrentProblem | null;
  /** Local timestamp when the game clock hits zero. */
  endsAt: number | null;
  /** Local timestamp when the countdown finishes. */
  countdownEndsAt: number | null;
  /** Local timestamp when the reconnect window closes. */
  pauseEndsAt: number | null;
  scores: Record<string, number>;
  lastPoint: ReceivedPoint | null;
  finished: FinishedPayload | null;
  error: string | null;
  notice: string | null;
  busy: boolean;
  createRoom: (nickname: string) => void;
  joinRoom: (code: string, nickname: string) => void;
  leaveRoom: () => void;
  updateSettings: (settings: GameSettings) => void;
  setReady: (ready: boolean) => void;
  submitAnswer: (problemId: number, value: string) => void;
  requestRematch: () => void;
  dismissError: () => void;
}

/**
 * Owns the socket subscription and all client-side game state.
 * Every timestamp from the server arrives as a relative duration and is converted to local time here.
 * @returns Game state plus actions.
 */
export function useGameClient(): GameClient {
  const [connected, setConnected] = useState(socket.connected);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [problem, setProblem] = useState<CurrentProblem | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  const [pauseEndsAt, setPauseEndsAt] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [lastPoint, setLastPoint] = useState<ReceivedPoint | null>(null);
  const [finished, setFinished] = useState<FinishedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Clears all room state, returning to the home screen. */
  const resetRoom = useCallback(() => {
    saveRoomCode(null);
    setRoom(null);
    setPlayerId(null);
    setProblem(null);
    setEndsAt(null);
    setCountdownEndsAt(null);
    setPauseEndsAt(null);
    setScores({});
    setLastPoint(null);
    setFinished(null);
  }, []);

  useEffect(() => {
    /** Rejoins the room remembered in this tab, if any. */
    function tryResume(): void {
      const code = loadRoomCode();
      if (!code) return;
      socket.emit('room:resume', { code, sessionId: getSessionId() }, (res) => {
        if (res.ok) setPlayerId(res.playerId);
        else resetRoom();
      });
    }

    /** Socket connected (initially or after a network drop). */
    const onConnect = () => {
      setConnected(true);
      tryResume();
    };
    /** Socket lost its connection. */
    const onDisconnect = () => setConnected(false);

    /**
     * Applies a room snapshot.
     * @param state - New room state.
     */
    const onState = (state: RoomState) => {
      setRoom(state);
      setScores(Object.fromEntries(state.players.map((p) => [p.id, p.score])));
      setPauseEndsAt(state.pauseRemainingMs === null ? null : Date.now() + state.pauseRemainingMs);
      if (state.phase === 'lobby') {
        setFinished(null);
        setProblem(null);
        setEndsAt(null);
        setCountdownEndsAt(null);
        setLastPoint(null);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('room:error', ({ message }) => setError(message));
    socket.on('room:kicked', ({ message }) => {
      resetRoom();
      setNotice(message);
    });
    socket.on('game:countdown', ({ startsInMs }) => {
      setFinished(null);
      setProblem(null);
      setLastPoint(null);
      setCountdownEndsAt(Date.now() + startsInMs);
    });
    socket.on('game:problem', ({ id, text, remainingMs }) => {
      setProblem({ id, text });
      setEndsAt(Date.now() + remainingMs);
      setCountdownEndsAt(null);
    });
    socket.on('game:point', (point) => {
      setScores(point.scores);
      setLastPoint({ ...point, receivedAt: Date.now() });
    });
    socket.on('game:finished', (payload) => {
      setFinished(payload);
      setProblem(null);
      setEndsAt(null);
    });

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('room:error');
      socket.off('room:kicked');
      socket.off('game:countdown');
      socket.off('game:problem');
      socket.off('game:point');
      socket.off('game:finished');
    };
  }, [resetRoom]);

  /**
   * Builds an ack handler for create/join requests.
   * @returns Callback that stores the room on success or shows the error.
   */
  const onJoined = useCallback((): Ack<JoinResult> => {
    return (res) => {
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      saveRoomCode(res.code);
      setPlayerId(res.playerId);
      setError(null);
      setNotice(null);
    };
  }, []);

  /**
   * Creates a new room as host.
   * @param nickname - Display name.
   */
  const createRoom = useCallback((nickname: string) => {
    setBusy(true);
    saveNickname(nickname);
    socket.emit('room:create', { nickname, sessionId: getSessionId() }, onJoined());
  }, [onJoined]);

  /**
   * Joins an existing room by code.
   * @param code - Room code.
   * @param nickname - Display name.
   */
  const joinRoom = useCallback((code: string, nickname: string) => {
    setBusy(true);
    saveNickname(nickname);
    socket.emit('room:join', { code, nickname, sessionId: getSessionId() }, onJoined());
  }, [onJoined]);

  /** Leaves the room (forfeits if a game is running). */
  const leaveRoom = useCallback(() => {
    socket.emit('room:leave');
    resetRoom();
  }, [resetRoom]);

  /**
   * Sends new settings (host only).
   * @param settings - Validated settings.
   */
  const updateSettings = useCallback((settings: GameSettings) => {
    socket.emit('settings:update', settings);
  }, []);

  /**
   * Sets this player's ready flag.
   * @param ready - Ready state.
   */
  const setReady = useCallback((ready: boolean) => {
    socket.emit('player:ready', ready);
  }, []);

  /**
   * Sends the current input for the server to check.
   * @param problemId - Problem being answered.
   * @param value - Current input text.
   */
  const submitAnswer = useCallback((problemId: number, value: string) => {
    socket.emit('answer:attempt', { problemId, value });
  }, []);

  /** Votes for a rematch. */
  const requestRematch = useCallback(() => {
    socket.emit('game:rematch');
  }, []);

  /** Hides the current error message. */
  const dismissError = useCallback(() => setError(null), []);

  return {
    connected, room, playerId, problem, endsAt, countdownEndsAt, pauseEndsAt, scores, lastPoint,
    finished, error, notice, busy,
    createRoom, joinRoom, leaveRoom, updateSettings, setReady, submitAnswer, requestRematch, dismissError,
  };
}
