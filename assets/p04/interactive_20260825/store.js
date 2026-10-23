// store.js — local persistence.
//
// Everything stays on this machine: IndexedDB, no account, no upload. Reload
// has to bring back the form, the camera, what is unlocked, how far the
// tutorial got, and the memory — otherwise "come back and find it" is a claim
// the demo cannot make.

const DB_NAME = 'meikku-shape-together';
const DB_VERSION = 1;
const STORE = 'save';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveState(key, value) {
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export async function loadState(key) {
  try {
    const db = await open();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value || null;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export async function clearState(key) {
  try {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (e) { return false; }
}
