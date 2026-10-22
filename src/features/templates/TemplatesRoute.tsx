import TemplateEditor from './TemplateEditor';
import TemplatesPage from './TemplatesPage';

export default function TemplatesRoute({ path }: { path: string }) {
  const m = /^\/templates\/(edit|copy)\/(.+)$/.exec(path);
  if (path === '/templates/new') return <TemplateEditor key="new" mode="new" />;
  if (m) return <TemplateEditor key={path} mode={m[1] as 'edit' | 'copy'} id={decodeURIComponent(m[2])} />;
  return <TemplatesPage />;
}
