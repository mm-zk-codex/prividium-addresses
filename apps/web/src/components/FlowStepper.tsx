import { statusStep } from '../app/utils';

export function FlowStepper({ events }: { events: any[] }) {
  const steps = [
    { key: 'deposit', label: 'Deposit received' },
    { key: 'bridge', label: 'Bridging to Prividium' },
    { key: 'finalize', label: 'Finalizing' },
    { key: 'complete', label: 'Completed' }
  ] as const;

  const activeIndex = Math.max(0, ...events.map((e) => steps.findIndex((s) => s.key === statusStep(e.status, e.stuck))));

  return (
    <div className="send-alias-progress">
      <h3 className="tab-subtitle">Transfer progress</h3>
      <div className="send-alias-steps">
        {steps.map((step, idx) => {
          const completed = idx < activeIndex || (idx === activeIndex && activeIndex === steps.length - 1);
          const current = idx === activeIndex;
          return (
            <div key={step.key} className={`send-alias-step ${completed ? 'complete' : current ? 'current' : ''}`}>
              <div className="send-alias-step-title">{step.label}</div>
              <div className="send-alias-step-state">{completed ? 'Done' : current ? 'In progress' : 'Pending'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
