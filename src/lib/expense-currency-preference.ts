import { CURRENCIES } from "./currencies";

const supportedCurrencies = new Set<string>(CURRENCIES);

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
/** Keep local choices immediately; serialize writes so slower requests cannot win. */
export function createCurrencyPreference(storage: () => Storage | null, persist: (workspaceId: string, currency: string) => Promise<unknown>) {
  const listeners = new Set<() => void>();
  const values = new Map<string, string>();
  const queues = new Map<string, Promise<unknown>>();
  const key = (id: string) => `amigo:expense-currency:${id}`;
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    read(id: string, fallback: string): string {
      let saved = values.get(id);
      try { saved ||= storage()?.getItem(key(id)) || undefined; } catch { /* Storage may be unavailable. */ }
      return saved && supportedCurrencies.has(saved) ? saved : fallback;
    },
    clear(id: string) {
      values.delete(id);
      try { storage()?.removeItem(key(id)); } catch { /* Memory remains usable. */ }
      listeners.forEach(listener => listener());
    },
    choose(id: string, currency: string): Promise<unknown> {
      if (!supportedCurrencies.has(currency)) return Promise.resolve();
      values.set(id, currency);
      listeners.forEach(listener => listener());
      try { storage()?.setItem(key(id), currency); } catch { /* Keep the in-memory choice. */ }
      const pending = (queues.get(id) || Promise.resolve()).catch(() => {}).then(() => persist(id, currency));
      const settled = pending.catch(() => {}); // Local choice survives offline; reopening retries.
      queues.set(id, settled);
      return settled;
    },
  };
}

export const expenseCurrencyPreference = createCurrencyPreference(
  () => typeof window === "undefined" ? null : window.localStorage,
  async (workspaceId, currency) => {
    const response = await fetch("/api/workspace", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, lastExpenseCurrency: currency }),
    });
    if (!response.ok) throw new Error("Currency preference was not synced");
  },
);
