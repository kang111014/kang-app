import { Suspense } from 'react';
import { useRoute } from './core/router';
import { FEATURES } from './features/registry';
import Home from './features/home/Home';

export default function App() {
  const path = useRoute();
  const feature = FEATURES.find((f) => f.match(path));
  if (!feature) return <Home />;
  const Page = feature.component;
  return (
    <Suspense fallback={<div className="page muted">載入中…</div>}>
      <Page path={path} />
    </Suspense>
  );
}
