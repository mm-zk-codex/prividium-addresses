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
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="border border-slate-800 rounded-xl p-3 md:p-4 flex flex-wrap items-center gap-2 justify-between bg-slate-900/40">
          <nav className="flex gap-2">
            <button className={route === '/send' ? 'btn-primary' : 'btn-secondary'} onClick={() => navigate('/send')}>Send</button>
            <button className={route === '/portal' ? 'btn-primary' : 'btn-secondary'} onClick={() => navigate('/portal')}>Recipient Portal</button>
          </nav>
          <div className="flex items-center gap-2 text-xs md:text-sm">
            {auth.isAuthenticated ? <span>Signed in as <b>{auth.displayName}</b></span> : <span>Not signed in</span>}
            {auth.isAuthenticated ? (
              <button
                className="btn-secondary"
                onClick={async () => {
                  await auth.logout();
                  navigate('/send');
                }}
              >
                Logout
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => void auth.login()}>Login</button>
            )}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
