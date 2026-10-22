import { deleteRecord, listRecords, putRecord, saveAsset, stamp, type SyncRecord } from '../../core/db';

/** 「交給 Claude 製作」的示範圖請求 */
export interface TemplateRequest extends SyncRecord {
  assetId: string;
  fileName: string;
  status: 'pending' | 'done';
}

export async function addRequest(file: File): Promise<TemplateRequest> {
  const assetId = await saveAsset(file, file.name);
  const rec = stamp({ assetId, fileName: file.name, status: 'pending' as const });
  return putRecord('templateRequests', rec);
}

export function listRequests() {
  return listRecords<TemplateRequest>('templateRequests');
}

export async function markDone(r: TemplateRequest) {
  await putRecord('templateRequests', { ...r, status: 'done' });
}

export async function removeRequest(id: string) {
  await deleteRecord('templateRequests', id);
}

export const CLAUDE_REQUEST_TEXT =
  '請幫我把這張示範圖做成 kang-app「限時動態產生器」的新版型（照 docs/TEMPLATES.md 的格式加到 src/templates/builtin/），做好後更新網站。';
