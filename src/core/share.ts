/**
 * 用手機的分享選單送出檔案（iPhone 可選「儲存影像／儲存影片」存進相簿）。
 * 不支援分享檔案的瀏覽器就改成直接下載。
 */
export async function shareFile(file: File, text?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const data: ShareData = { files: [file] };
  if (text) data.text = text;
  if (navigator.canShare && navigator.canShare(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // 其他錯誤就退回下載
    }
  }
  downloadFile(file);
  return 'downloaded';
}

export function downloadFile(file: Blob, name?: string) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name ?? (file instanceof File ? file.name : 'download');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function timestampName(prefix: string, ext: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}
