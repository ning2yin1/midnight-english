import { defaults } from "./core.js";
const opened = new Promise((resolve, reject) => {
  const r = indexedDB.open("midnight-english", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("state");
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
export async function read() {
  const db = await opened;
  return new Promise((res, rej) => {
    const r = db.transaction("state").objectStore("state").get("app");
    r.onsuccess = () => res(r.result || defaults());
    r.onerror = () => rej(r.error);
  });
}
export async function write(data) {
  const db = await opened;
  return new Promise((res, rej) => {
    const t = db.transaction("state", "readwrite");
    t.objectStore("state").put(data, "app");
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || Error("保存が中断されました。"));
  });
}
