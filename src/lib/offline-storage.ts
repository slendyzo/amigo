// IndexedDB wrapper for offline expense storage

const DB_NAME = "amigo-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-expenses";

export type OfflineExpense = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  categoryId?: string;
  bankAccountId?: string;
  projectIds?: string[];
  notes?: string;
  createdAt: number;
  syncAttempts: number;
};

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

export async function savePendingExpense(expense: Omit<OfflineExpense, "id" | "createdAt" | "syncAttempts">): Promise<string> {
  const database = await openDB();

  const id = `offline-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const fullExpense: OfflineExpense = {
    ...expense,
    id,
    createdAt: Date.now(),
    syncAttempts: 0,
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(fullExpense);

    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingExpenses(): Promise<OfflineExpense[]> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const expenses = await getPendingExpenses();
  return expenses.length;
}

export async function removePendingExpense(id: string): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateSyncAttempts(id: string): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const expense = getRequest.result as OfflineExpense;
      if (expense) {
        expense.syncAttempts += 1;
        const putRequest = store.put(expense);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function clearAllPending(): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Sync pending expenses to server
export async function syncPendingExpenses(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingExpenses();
  let synced = 0;
  let failed = 0;

  for (const expense of pending) {
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: expense.name,
          amount: expense.amount,
          currency: expense.currency,
          type: expense.type,
          date: expense.date,
          categoryId: expense.categoryId || null,
          bankAccountId: expense.bankAccountId || null,
          projectIds: expense.projectIds || [],
          notes: expense.notes || "",
        }),
      });

      if (response.ok) {
        await removePendingExpense(expense.id);
        synced++;
      } else {
        await updateSyncAttempts(expense.id);
        failed++;
      }
    } catch {
      await updateSyncAttempts(expense.id);
      failed++;
    }
  }

  return { synced, failed };
}

// Check if IndexedDB is available
export function isOfflineStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
