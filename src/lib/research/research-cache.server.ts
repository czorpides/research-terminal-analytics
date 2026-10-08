/**
 * Single-flight short-lived in-memory cache for expensive read-only research
 * snapshots. Results keep their source as-of dates; no investment scoring is
 * changed. Failed loads are never cached.
 */
type Entry = { expires: number; value?: unknown; pending?: Promise<unknown> };
const entries = new Map<string, Entry>();

export async function cachedResearchWorkspace<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = 5 * 60_000,
): Promise<T> {
  const existing = entries.get(key);
  if (existing?.pending) return existing.pending as Promise<T>;
  if (existing && "value" in existing && existing.expires > Date.now()) {
    return existing.value as T;
  }
  const pending = loader().then(
    value => {
      if (entries.get(key)?.pending === pending) {
        entries.set(key, { value, expires: Date.now() + ttlMs });
      }
      return value;
    },
    error => {
      if (entries.get(key)?.pending === pending) entries.delete(key);
      throw error;
    },
  );
  entries.set(key, { expires: 0, pending });
  return pending;
}
