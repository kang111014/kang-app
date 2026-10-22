/** 下載網路圖片並轉成本機物件網址（下載後畫到畫布上才不會被瀏覽器擋） */
export async function fetchAsObjectUrl(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`下載失敗（${res.status}）`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('連線逾時')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
