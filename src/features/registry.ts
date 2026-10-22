import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * 功能清單。要新增功能時：
 *  1. 在 src/features/<功能名稱>/ 建立頁面元件
 *  2. 在下面加一筆（path 是網址路徑，match 決定哪些網址由它負責）
 * 首頁會自動出現新的功能卡片。
 */
export interface Feature {
  id: string;
  name: string;
  description: string;
  emoji: string;
  path: string;
  /** 不顯示在首頁（例如設定頁） */
  hidden?: boolean;
  match: (path: string) => boolean;
  component: LazyExoticComponent<ComponentType<{ path: string }>>;
}

export const FEATURES: Feature[] = [
  {
    id: 'story',
    name: '限時動態產生器',
    description: '選照片影片，自動排成 IG 限動拼貼',
    emoji: '🎞️',
    path: '/story',
    match: (p) => p === '/story',
    component: lazy(() => import('./story/StoryPage')),
  },
  {
    id: 'templates',
    name: '版型管理',
    description: '看所有版型、自己做新版型',
    emoji: '🧩',
    path: '/templates',
    match: (p) => p.startsWith('/templates'),
    component: lazy(() => import('./templates/TemplatesRoute')),
  },
  {
    id: 'settings',
    name: '設定',
    description: '網路素材、金鑰、安裝教學',
    emoji: '⚙️',
    path: '/settings',
    match: (p) => p === '/settings',
    component: lazy(() => import('./settings/SettingsPage')),
  },
];
