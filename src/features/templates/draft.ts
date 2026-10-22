import type { StoryTemplate } from '../../story/types';

/** 尚未儲存的版型（例如 Claude 剛分析完的結果），交給編輯器調整 */
let draft: StoryTemplate | null = null;

export function setDraft(t: StoryTemplate) {
  draft = t;
}

export function takeDraft(): StoryTemplate | null {
  return draft;
}
