import { openDB } from "idb";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const DB_NAME = "barstock-query-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";
const CACHE_KEY = "reactQueryClient";

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/**
 * Custom IndexedDB-based Persister for @tanstack/react-query-persist-client.
 * Avoids localStorage's 5MB limit by storing the query cache in IndexedDB.
 */
export function createIDBPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const db = await getDB();
      await db.put(STORE_NAME, client, CACHE_KEY);
    },
    restoreClient: async () => {
      const db = await getDB();
      return (await db.get(STORE_NAME, CACHE_KEY)) as PersistedClient | undefined;
    },
    removeClient: async () => {
      const db = await getDB();
      await db.delete(STORE_NAME, CACHE_KEY);
    },
  };
}
