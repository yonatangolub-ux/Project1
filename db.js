// אחסון בטלפון בלבד (IndexedDB). שום דבר לא עולה לשרת.
const DB_NAME = 'tik';
const VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('transitions', { keyPath: 'id' });
        db.createObjectStore('docs', { keyPath: 'name' }); // מסמך מזוהה לפי השם שלו
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const keys = (store) => run(store, 'readonly', (s) => s.getAllKeys());
export const get = (store, key) => run(store, 'readonly', (s) => s.get(key));
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const del = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

export async function getPinned() {
  const row = await get('meta', 'pinned');
  return row ? row.value : [];
}
export const setPinned = (names) => put('meta', { key: 'pinned', value: names });
