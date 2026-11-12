'use client';

interface ResetCorpusButtonProps {
  disabled: boolean;
  busy: boolean;
  onReset: () => void;
}

export default function ResetCorpusButton({ disabled, busy, onReset }: ResetCorpusButtonProps) {
  return (
    <button
      type="button"
      className="corpus-reset-button"
      onClick={onReset}
      disabled={disabled || busy}
    >
      {busy ? (
        <>
          Clearing corpus <span className="spinner" aria-hidden="true" />
        </>
      ) : (
        'Reset corpus'
      )}
    </button>
  );
}
