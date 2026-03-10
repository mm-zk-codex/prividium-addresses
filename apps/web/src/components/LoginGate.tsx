import React from 'react';

type Props = { onLogin: () => Promise<void> };

export function LoginGate({ onLogin }: Props) {
  return (
    <div className="card">
      <div className="tab-header">
        <div>
          <div className="tab-title">Recipient Portal</div>
          <div className="tab-subtitle">Please login with Prividium to continue to your portal. You will return to this page after authentication.</div>
        </div>
      </div>

      <button style={{ width: 'auto' }} onClick={() => void onLogin()}>Login with Prividium</button>
    </div>
  );
}
