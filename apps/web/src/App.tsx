import { useEffect, useState } from 'react';
import type { Route } from './app/types';
import { getInitialRoute } from './app/utils';
import { usePrividiumAuth } from './auth/PrividiumAuth';
import { Layout } from './components/Layout';
import { LoginGate } from './components/LoginGate';
import { PortalPage } from './pages/PortalPage';
import { SendPage } from './pages/SendPage';

export function App() {
  const resolver = import.meta.env.VITE_RESOLVER_URL ?? 'http://localhost:4000';
  const auth = usePrividiumAuth();
  const [route, setRoute] = useState<Route>(getInitialRoute());

  const navigate = (to: Route) => {
    if (window.location.pathname !== to) window.history.pushState({}, '', to);
    setRoute(to);
  };

  useEffect(() => {
    const onPopState = () => setRoute(getInitialRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <Layout route={route} navigate={navigate}>
      <div className="route-toggle-wrap">
        <div className="route-toggle" role="tablist" aria-label="Primary views">
          <button className={`route-toggle-btn ${route === '/send' ? 'active' : ''}`} onClick={() => navigate('/send')}>
            Send
          </button>
          <button className={`route-toggle-btn ${route === '/portal' ? 'active' : ''}`} onClick={() => navigate('/portal')}>
            Recipient Portal
          </button>
        </div>
      </div>
      {route === '/portal' ? (
        auth.isAuthenticated ? (
          <PortalPage resolver={resolver} />
        ) : (
          <LoginGate onLogin={async () => {
            await auth.login();
            await auth.refresh();
            navigate('/portal');
          }} />
        )
      ) : (
        <SendPage resolver={resolver} />
      )}
    </Layout>
  );
}
