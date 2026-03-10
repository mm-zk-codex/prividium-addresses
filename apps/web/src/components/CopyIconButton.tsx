export function CopyIconButton({ onClick, label, copied }: { onClick: () => void; label: string; copied: boolean }) {
  return (
    <button
      className={`copy-icon-btn ${copied ? 'copied' : ''}`}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </button>
  );
}
