import type { ReactNode } from 'react';
import { navigate } from '../core/router';

export default function TopBar({ title, back = '/', right }: { title: string; back?: string | null; right?: ReactNode }) {
  return (
    <header className="topbar">
      {back !== null && (
        <button className="icon-btn" onClick={() => navigate(back)} aria-label="返回">
          ‹ 返回
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}
