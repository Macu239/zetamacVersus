import { useState, type FormEvent } from "react";
import { loadNickname } from "../session";

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
  return (
    new URLSearchParams(window.location.search)
      .get("code")
      ?.toUpperCase()
      .slice(0, 5) ?? ""
  );
}

/**
 * Landing screen: pick a nickname, then create a room or join one with a code.
 * @param props - Home props.
 * @returns The home screen.
 */
export function Home({ busy, error, notice, onCreate, onJoin }: HomeProps) {
  const [nickname, setNickname] = useState(loadNickname);
  const [code, setCode] = useState(codeFromUrl);
  const [nameError, setNameError] = useState<string | null>(null);

  /**
   * Submits the join form.
   * @param e - Form event.
   */
  function submitJoin(e: FormEvent): void {
    e.preventDefault();
    const name = validateName();
    if (name && code.length === 5) onJoin(code, nickname.trim());
  }

  function validateName(): string | null {
    const name = nickname.trim();
    if (!name) {
      setNameError("Please enter a nickname.");
      document.getElementById("nickname")?.focus();
      return null;
    }
    setNameError(null);
    return name;
  }

  return (
    <>
      <h1>Zetamac Versus</h1>
      <p>
        A two-player version of the Arithmetic Game. In Race mode both players
        get the same problem at the same time and whoever answers first scores.
        In Same set mode both get the same list of problems and each works
        through it at their own pace.
      </p>
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}

      <div className="inline-form">
        <label htmlFor="nickname">Your name:</label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          maxLength={16}
          autoComplete="nickname"
          placeholder="Enter your nickname"
          onChange={(e) => {
            setNickname(e.target.value);
            if (nameError) setNameError(null);
          }}
        />
        {nameError && <p id="nickname-error" className="error" role="alert">{nameError}</p>}
      </div>

      <h2>Start a new room</h2>
      <p>
        You become the host and choose the settings. Then send the room code to
        your opponent.
      </p>
      <div className="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const name = validateName();
            if (name) onCreate(name);
          }}
        >
          Create room
        </button>
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
          autoFocus={code !== ""}
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          }
        />
        <button type="submit" disabled={busy || code.length !== 5}>
          Join
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
