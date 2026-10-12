import type { FinishedPayload, RoomState } from '@zv/shared';
import { formatSolve } from '../format';

interface ResultsProps {
  room: RoomState;
  playerId: string;
  finished: FinishedPayload | null;
  onRematch: () => void;
  onLeave: () => void;
}

/**
 * End-of-game screen with the winner, stats and rematch.
 * @param props - Results props.
 * @returns The results screen.
 */
export function Results({ room, playerId, finished, onRematch, onLeave }: ResultsProps) {
  const me = room.players.find((p) => p.id === playerId);
  const opp = room.players.find((p) => p.id !== playerId);

  if (!finished) return <p role="status">Loading results...</p>;

  let headline = 'Tie game';
  if (finished.winnerId === playerId) headline = 'You win';
  else if (finished.winnerId) headline = 'You lose';

  const myStats = finished.stats.find((s) => s.playerId === playerId);
  const oppStats = finished.stats.find((s) => s.playerId !== playerId);
  const rows = [myStats, oppStats].filter((s) => s !== undefined);

  return (
    <>
      <h1 className={finished.winnerId === playerId ? 'win' : undefined}>{headline}</h1>
      {finished.reason === 'forfeit' && (
        <p>{finished.winnerId === playerId ? 'Your opponent left the game.' : 'You left the game.'}</p>
      )}
      <p>
        Final score: you {myStats?.score ?? 0}, {oppStats?.nickname ?? 'opponent'} {oppStats?.score ?? 0}.
      </p>

      <table className="stats">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Points</th>
            <th scope="col">Average solve</th>
            <th scope="col">Fastest solve</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.playerId}>
              <th scope="row">{s.nickname}{s.playerId === playerId ? ' (you)' : ''}</th>
              <td>{s.score}</td>
              <td>{formatSolve(s.avgSolveMs)}</td>
              <td>{formatSolve(s.fastestSolveMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="actions">
        <button type="button" onClick={onLeave}>Leave room</button>
        <button type="button" disabled={me?.wantsRematch} onClick={onRematch}>
          {!opp ? 'Back to lobby' : me?.wantsRematch ? 'Waiting for opponent...' : 'Rematch'}
        </button>
      </div>
      <p className="note right" role="status">
        {opp?.wantsRematch && !me?.wantsRematch ? `${opp.nickname} wants a rematch.` : ''}
      </p>
    </>
  );
}
