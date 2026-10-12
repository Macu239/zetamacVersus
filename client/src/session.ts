const SESSION_KEY = 'zv:session';
const ROOM_KEY = 'zv:room';
const NICK_KEY = 'zv:nickname';

/**
 * Reads a storage key, tolerating blocked storage.
 * @param store - Which storage to use.
 * @param key - Storage key.
 * @returns The stored value or null.
 */
function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

/**
 * Writes or removes a storage key, tolerating blocked storage.
 * @param store - Which storage to use.
 * @param key - Storage key.
 * @param value - Value to store, or null to remove.
 */
function write(store: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    /* storage unavailable; rejoining after a refresh will not work */
  }
}

const tab = () => sessionStorage;
const device = () => localStorage;

let memorySession: string | null = null;

/**
 * Returns this tab's private session id, creating one on first use.
 * Stored per tab (survives refresh), so two tabs act as two separate players.
 * @returns Session id.
 */
export function getSessionId(): string {
  const existing = read(tab, SESSION_KEY) ?? memorySession;
  if (existing) return existing;
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  memorySession = id;
  write(tab, SESSION_KEY, id);
  return id;
}

/**
 * Last room code in this tab, used to rejoin after a refresh.
 * @returns Room code or null.
 */
export function loadRoomCode(): string | null {
  return read(tab, ROOM_KEY);
}

/**
 * Remembers or forgets the current room code.
 * @param code - Room code, or null to clear.
 */
export function saveRoomCode(code: string | null): void {
  write(tab, ROOM_KEY, code);
}

/**
 * Last nickname used on this device.
 * @returns Nickname or empty string.
 */
export function loadNickname(): string {
  return read(device, NICK_KEY) ?? '';
}

/**
 * Remembers the nickname for next time.
 * @param name - Nickname.
 */
export function saveNickname(name: string): void {
  write(device, NICK_KEY, name);
}
