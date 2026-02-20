import React from 'react';

type Props = { onLogin: () => Promise<void> };

export function LoginGate({ onLogin }: Props) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold">Recipient Portal requires login</h2>
      <p className="text-sm text-slate-300">Please login with Prividium to continue to your portal. You will return to this page after authentication.</p>
      <button onClick={() => void onLogin()}>Login with Prividium</button>
    </div>
  );
}
