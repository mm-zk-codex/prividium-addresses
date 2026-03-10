import React from 'react';
import { usePrividiumAuth } from '../auth/PrividiumAuth';

type Props = {
  route: '/send' | '/portal';
  navigate: (to: '/send' | '/portal') => void;
  children: React.ReactNode;
};

export function Layout({ route, navigate, children }: Props) {
  const auth = usePrividiumAuth();

  return (
    <div className="app-shell">
      <div className="app-shell__inner">
        <header className="app-header">
          <div className="app-logo">
            <div className="app-logo-title">Prividium Stealth Deposits</div>
          </div>
          <div className="header-right">
            <div className="header-badge">
              {auth.isAuthenticated ? <span>Signed in as <b>{auth.displayName}</b></span> : <span>Not signed in</span>}
            </div>
            {auth.isAuthenticated ? (
              <button
                className="secondary"
                style={{ width: 'auto' }}
                onClick={async () => {
                  await auth.logout();
                  navigate('/send');
                }}
              >
                Logout
              </button>
            ) : (
              <button className="secondary" style={{ width: 'auto' }} onClick={() => void auth.login()}>Login</button>
            )}
          </div>
        </header>

        <div className="container">
          {children}
        </div>
      </div>
    </div>
  );
}
