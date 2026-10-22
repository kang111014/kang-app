import { deleteRecord, listRecords, putRecord, stamp } from '../core/db';
import { parseTemplate } from './schema';
import type { StoryTemplate } from './types';

// 內建版型：src/templates/builtin/ 底下每個 .json 檔就是一個版型，新增檔案即可
const builtinFiles = import.meta.glob('../templates/builtin/*.json', { eager: true, import: 'default' });

export const BUILTIN_TEMPLATES: StoryTemplate[] = Object.values(builtinFiles)
  .map((d) => parseTemplate(d))
  .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

export async function listUserTemplates(): Promise<StoryTemplate[]> {
  const recs = await listRecords<StoryTemplate & { id: string; createdAt: number; updatedAt: number }>('templates');
  const out: StoryTemplate[] = [];
  for (const r of recs) {
    try {
      out.push(parseTemplate(r));
    } catch {
      // 格式壞掉的版型略過
    }
  }
  return out;
}

export async function listAllTemplates(): Promise<StoryTemplate[]> {
  return [...(await listUserTemplates()), ...BUILTIN_TEMPLATES];
}

export async function saveUserTemplate(t: StoryTemplate): Promise<StoryTemplate> {
  const base = t.createdAt ? (t as StoryTemplate & { id: string; createdAt: number; updatedAt: number }) : stamp(t, t.id);
  const saved = await putRecord('templates', { ...base, source: t.source === 'builtin' ? 'user' : t.source });
  return saved as StoryTemplate;
}

export async function deleteUserTemplate(id: string) {
  await deleteRecord('templates', id);
}

/** 停用的版型 id 清單（隨機時不會抽到） */
export const DISABLED_KEY = 'story.disabledTemplates';
