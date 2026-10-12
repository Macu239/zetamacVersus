import { useState } from 'react';
import type { GameSettings, RoomState } from '@zv/shared';
import { SettingsPanel } from '../components/SettingsPanel';

interface LobbyProps {
  room: RoomState;
  playerId: string;
  error: string | null;
  onSettings: (settings: GameSettings) => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
}

/**
 * Pre-game room: invite code, players, settings and ready toggles.
 * @param props - Lobby props.
 * @returns The lobby screen.
 */
export function Lobby({ room, playerId, error, onSettings, onReady, onLeave }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const me = room.players.find((p) => p.id === playerId);
  const hasOpponent = room.players.length === 2;
  const inviteUrl = `${window.location.origin}/?code=${room.code}`;

  /** Copies the invite link to the clipboard. */
  async function copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <h1>Room {room.code}</h1>
      <p>
        Send your opponent the code <strong>{room.code}</strong> or this link:{' '}
        <a className="invite" href={inviteUrl}>{inviteUrl}</a>{' '}
        <button type="button" onClick={copyInvite}>Copy link</button>{' '}
        <span className="note" role="status" aria-live="polite">{copied ? 'Copied.' : ''}</span>
      </p>

      <h2>Players</h2>
      <ul className="players">
        {room.players.map((p) => {
          const tags = [p.id === playerId && 'you', p.id === room.hostId && 'host'].filter(Boolean).join(', ');
          const status = !p.connected ? 'reconnecting...' : p.ready ? 'ready' : 'not ready';
          return (
            <li key={p.id}>
              <strong>{p.nickname}</strong>{tags && ` (${tags})`}: {status}
            </li>
          );
        })}
        {!hasOpponent && <li className="note">Waiting for an opponent to join...</li>}
      </ul>

      <h2>Settings</h2>
      <SettingsPanel settings={room.settings} editable={room.hostId === playerId} onChange={onSettings} />

      {error && <p className="error" role="alert">{error}</p>}

      <div className="actions">
        <button type="button" onClick={onLeave}>Leave room</button>
        <button type="button" aria-pressed={me?.ready ?? false} onClick={() => onReady(!me?.ready)}>
          {me?.ready ? 'Cancel ready' : 'Ready'}
        </button>
      </div>
      <p className="note right">
        {hasOpponent ? 'The game starts when both players are ready.' : 'You can start once an opponent joins.'}
      </p>
    </>
  );
}
