import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * 本機資料庫（IndexedDB）。
 *
 * 為了日後能改成跨裝置同步，每筆資料都遵守同一個格式：
 *  - id：全域唯一（UUID），不同裝置產生的資料不會撞號
 *  - createdAt / updatedAt：毫秒時間戳，同步時以 updatedAt 較新者為準
 *  - deletedAt：刪除時只做標記（墓碑），同步時才知道要把別台裝置上的也刪掉
 *
 * 新功能要存資料時，在 StoreMap 加一個 store，並把 DB_VERSION 加 1。
 */
export interface SyncRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface AssetRecord extends SyncRecord {
  blob: Blob;
  type: string;
  name?: string;
}

export interface KvRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

interface AppDB extends DBSchema {
  kv: { key: string; value: KvRecord };
  assets: { key: string; value: AssetRecord };
  // 版型與「等 Claude 製作」的請求，型別定義在各功能模組
  templates: { key: string; value: SyncRecord & Record<string, unknown> };
  templateRequests: { key: string; value: SyncRecord & Record<string, unknown> };
}

type StoreName = 'assets' | 'templates' | 'templateRequests';

const DB_NAME = 'kang-app';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('templates')) d.createObjectStore('templates', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('templateRequests')) d.createObjectStore('templateRequests', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

export function stamp<T extends object>(data: T, id?: string): T & SyncRecord {
  const now = Date.now();
  return { ...data, id: id ?? newId(), createdAt: now, updatedAt: now, deletedAt: null };
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const rec = await (await db()).get('kv', key);
  return rec === undefined ? fallback : (rec.value as T);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', { key, value, updatedAt: Date.now() });
}

export async function putRecord<T extends SyncRecord>(store: StoreName, rec: T): Promise<T> {
  const next = { ...rec, updatedAt: Date.now() };
  await (await db()).put(store, next as never);
  return next;
}

export async function getRecord<T extends SyncRecord>(store: StoreName, id: string): Promise<T | undefined> {
  const rec = (await (await db()).get(store, id)) as T | undefined;
  return rec && !rec.deletedAt ? rec : undefined;
}

export async function listRecords<T extends SyncRecord>(store: StoreName): Promise<T[]> {
  const all = (await (await db()).getAll(store)) as T[];
  return all.filter((r) => !r.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 軟刪除：留下墓碑，方便日後同步 */
export async function deleteRecord(store: StoreName, id: string): Promise<void> {
  const d = await db();
  const rec = await d.get(store, id);
  if (!rec) return;
  const now = Date.now();
  // 素材本體很大，刪除時把檔案內容清掉，只留墓碑
  const tomb = store === 'assets' ? { ...rec, blob: new Blob(), deletedAt: now, updatedAt: now } : { ...rec, deletedAt: now, updatedAt: now };
  await d.put(store, tomb as never);
}

export async function saveAsset(blob: Blob, name?: string): Promise<string> {
  const rec = stamp({ blob, type: blob.type, name }) as AssetRecord;
  await putRecord('assets', rec);
  return rec.id;
}

export async function loadAsset(id: string): Promise<Blob | undefined> {
  const rec = await getRecord<AssetRecord>('assets', id);
  return rec?.blob;
}
