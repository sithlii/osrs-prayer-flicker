// localStorage helpers. Every access is guarded: storage can be unavailable (private mode, blocked).

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function loadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked; the app keeps working in memory.
  }
}

/** Encode JSON as a compact, copy-pasteable code. */
export function encodeCode(value: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))));
}

export function decodeCode<T>(code: string): T {
  return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
}
