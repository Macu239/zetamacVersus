import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { RoomState } from '@zv/shared';
import { useNow } from '../useNow';
import type { CurrentProblem, ReceivedPoint } from '../useGameClient';

const FLASH_MS = 1200;

interface GameProps {
  room: RoomState;
  playerId: string;
  problem: CurrentProblem | null;
  endsAt: number | null;
  countdownEndsAt: number | null;
  pauseEndsAt: number | null;
  scores: Record<string, number>;
  lastPoint: ReceivedPoint | null;
  onSubmit: (problemId: number, value: string) => void;
  onLeave: () => void;
}

/**
 * The race screen, laid out like Zetamac: seconds left, scores, and "a + b = [answer]".
 * Answers are sent on every keystroke, so there is no Enter key.
 * @param props - Game props.
 * @returns The game screen.
 */
export function Game({ room, playerId, problem, endsAt, countdownEndsAt, pauseEndsAt, scores, lastPoint, onSubmit, onLeave }: GameProps) {
  const now = useNow(100);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const me = room.players.find((p) => p.id === playerId);
  const opp = room.players.find((p) => p.id !== playerId);
  const myScore = me ? scores[me.id] ?? 0 : 0;
  const oppScore = opp ? scores[opp.id] ?? 0 : 0;

  useEffect(() => {
    setValue('');
    inputRef.current?.focus();
  }, [problem?.id, room.phase]);

  /**
   * Keeps digits and a leading minus, then sends the attempt.
   * @param e - Input change event.
   */
  function onChange(e: ChangeEvent<HTMLInputElement>): void {
    const next = e.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');
    setValue(next);
    if (problem && next !== '' && next !== '-') onSubmit(problem.id, next);
  }

  /** Confirms, then leaves (forfeits). */
  function leave(): void {
    if (window.confirm('Leave now? This forfeits the game.')) onLeave();
  }

  const isSet = room.settings.mode === 'set';
  // In Same set mode the opponent's points never interrupt you: no flash, only the score line updates.
  const flashVisible = lastPoint && now - lastPoint.receivedAt < FLASH_MS && (!isSet || lastPoint.playerId === playerId);
  const flash = flashVisible ? lastPoint : null;
  /**
   * Formats a score, with progress in Same set mode (progress is always score + 1, since only correct answers advance).
   * @param score - Problems solved.
   * @returns Display text.
   */
  const scoreText = (score: number) => (isSet ? `${score} (on #${score + 1})` : String(score));
  let flashText = '';
  if (flash) flashText = flash.playerId === playerId ? `You got it: ${flash.answer}` : `${opp?.nickname ?? 'Opponent'} got it: ${flash.answer}`;

  let secondsLeft = room.settings.durationSec;
  if (room.phase === 'playing' && endsAt) secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const countdown = countdownEndsAt ? Math.max(1, Math.ceil((countdownEndsAt - now) / 1000)) : 3;
  const pauseLeft = pauseEndsAt ? Math.max(0, Math.ceil((pauseEndsAt - now) / 1000)) : 0;

  return (
    <>
      <div className="topbar">
        <span role="timer">
          {room.phase === 'paused' ? 'Paused' : `Seconds left: ${secondsLeft}`}
          <span className="note"> ({isSet ? 'Same set' : 'Race'})</span>
        </span>
        <span>
          Score: you {scoreText(myScore)}, {opp?.nickname ?? 'opponent'} {scoreText(oppScore)}
        </span>
      </div>

      <div className="arena">
        {room.phase === 'countdown' && (
          <>
            <p>Get ready</p>
            <p className="big" aria-live="assertive">{countdown}</p>
          </>
        )}

        {room.phase === 'paused' && (
          <p role="status">
            {opp?.nickname ?? 'Your opponent'} disconnected. Waiting {pauseLeft} seconds for them to come back.
            If they do not, you win by forfeit.
          </p>
        )}

        {room.phase === 'playing' && problem && (
          <>
            <div className="problem-line">
              <span>{problem.text} =</span>
              <label htmlFor="answer" className="sr-only">Answer to {problem.text}</label>
              <input
                id="answer"
                ref={inputRef}
                className="answer"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={value}
                onChange={onChange}
                autoFocus
              />
            </div>
            <p className={flash?.playerId === playerId ? 'flash you' : 'flash'} aria-live="polite">{flashText}</p>
          </>
        )}
      </div>

      <div className="actions">
        <button type="button" onClick={leave}>Forfeit and leave</button>
      </div>
    </>
  );
}
