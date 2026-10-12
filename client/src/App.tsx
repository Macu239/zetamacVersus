import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Results } from './screens/Results';
import { useGameClient } from './useGameClient';

/**
 * Root component. Picks the screen from the room phase reported by the server.
 * @returns The current screen.
 */
export default function App() {
  const g = useGameClient();

  /**
   * Chooses the screen for the current state.
   * @returns Screen element.
   */
  function screen() {
    if (!g.room || !g.playerId) {
      return <Home busy={g.busy} error={g.error} notice={g.notice} onCreate={g.createRoom} onJoin={g.joinRoom} />;
    }
    switch (g.room.phase) {
      case 'lobby':
        return (
          <Lobby room={g.room} playerId={g.playerId} error={g.error} onSettings={g.updateSettings} onReady={g.setReady} onLeave={g.leaveRoom} />
        );
      case 'finished':
        return <Results room={g.room} playerId={g.playerId} finished={g.finished} onRematch={g.requestRematch} onLeave={g.leaveRoom} />;
      default:
        return (
          <Game
            room={g.room}
            playerId={g.playerId}
            problem={g.problem}
            endsAt={g.endsAt}
            countdownEndsAt={g.countdownEndsAt}
            pauseEndsAt={g.pauseEndsAt}
            scores={g.scores}
            lastPoint={g.lastPoint}
            onSubmit={g.submitAnswer}
            onLeave={g.leaveRoom}
          />
        );
    }
  }

  return (
    <main className="panel">
      {!g.connected && <p className="note" role="status">Connecting to server...</p>}
      {screen()}
    </main>
  );
}
