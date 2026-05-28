const DB_NAME = "brain-tools";
const DB_VERSION = 1;

let dbPromise;

export function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      createStore(database, "entries", "id", ["status", "type", "project", "createdAt"]);
      createStore(database, "operations", "id", ["status", "createdAt", "entryId"]);
      createStore(database, "meta", "key");
      createStore(database, "fileIndex", "path");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function createStore(database, name, keyPath, indexes = []) {
  if (database.objectStoreNames.contains(name)) return;
  const store = database.createObjectStore(name, { keyPath });
  indexes.forEach((index) => store.createIndex(index, index));
}

export async function put(storeName, value) {
  const database = await db();
  return tx(database, storeName, "readwrite", (store) => store.put(value));
}

export async function get(storeName, key) {
  const database = await db();
  return tx(database, storeName, "readonly", (store) => store.get(key));
}

export async function getAll(storeName) {
  const database = await db();
  return tx(database, storeName, "readonly", (store) => store.getAll());
}

export async function deleteItem(storeName, key) {
  const database = await db();
  return tx(database, storeName, "readwrite", (store) => store.delete(key));
}

export async function setMeta(key, value) {
  return put("meta", { key, value });
}

export async function getMeta(key) {
  return (await get("meta", key))?.value;
}

export async function saveDirectoryHandle(handle) {
  return setMeta("wikiDirectoryHandle", handle);
}

export async function loadDirectoryHandle() {
  return getMeta("wikiDirectoryHandle");
}

export async function addEntry(entry) {
  const now = new Date().toISOString();
  const next = { ...entry, id: entry.id || crypto.randomUUID(), createdAt: entry.createdAt || now, updatedAt: now };
  await put("entries", next);
  return next;
}

export async function updateEntry(entry) {
  return addEntry({ ...entry, updatedAt: new Date().toISOString() });
}

export async function addOperation(operation) {
  const now = new Date().toISOString();
  const next = { ...operation, id: operation.id || crypto.randomUUID(), status: operation.status || "pending", createdAt: operation.createdAt || now, updatedAt: now, history: operation.history || [] };
  await put("operations", next);
  return next;
}

export async function updateOperation(operation, status, extra = {}) {
  const next = {
    ...operation,
    ...extra,
    status,
    updatedAt: new Date().toISOString(),
    history: [...(operation.history || []), { status, at: new Date().toISOString(), message: extra.message || "" }]
  };
  await put("operations", next);
  return next;
}

function tx(database, storeName, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = callback(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
