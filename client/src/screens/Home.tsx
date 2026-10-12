import { useState, type FormEvent } from 'react';
import { loadNickname } from '../session';

interface HomeProps {
  busy: boolean;
  error: string | null;
  notice: string | null;
  onCreate: (nickname: string) => void;
  onJoin: (code: string, nickname: string) => void;
}

/**
 * Reads an invite code from the page URL (?code=ABCDE).
 * @returns The code or an empty string.
 */
function codeFromUrl(): string {
  return new URLSearchParams(window.location.search).get('code')?.toUpperCase().slice(0, 5) ?? '';
}

/**
 * Landing screen: pick a nickname, then create a room or join one with a code.
 * @param props - Home props.
 * @returns The home screen.
 */
export function Home({ busy, error, notice, onCreate, onJoin }: HomeProps) {
  const [nickname, setNickname] = useState(loadNickname);
  const [code, setCode] = useState(codeFromUrl);

  /**
   * Submits the join form.
   * @param e - Form event.
   */
  function submitJoin(e: FormEvent): void {
    e.preventDefault();
    if (code.length === 5) onJoin(code, nickname.trim());
  }

  return (
    <>
      <h1>Zetamac Versus</h1>
      <p>
        A two-player version of the Arithmetic Game. Both players get the same problem at the same time,
        and whoever answers correctly first scores the point.
      </p>
      {notice && <p className="note" role="status">{notice}</p>}

      <div className="inline-form">
        <label htmlFor="nickname">Your name:</label>
        <input id="nickname" type="text" value={nickname} maxLength={16} autoComplete="nickname" placeholder="Player" onChange={(e) => setNickname(e.target.value)} />
      </div>

      <h2>Join a room</h2>
      <form className="inline-form" onSubmit={submitJoin}>
        <label htmlFor="room-code">Room code:</label>
        <input
          id="room-code"
          className="code-input"
          type="text"
          value={code}
          maxLength={5}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={code !== ''}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
        <button type="submit" disabled={busy || code.length !== 5}>Join</button>
      </form>

      <h2>Start a new room</h2>
      <p>You become the host and choose the settings. Then send the room code to your opponent.</p>
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => onCreate(nickname.trim())}>Create room</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
