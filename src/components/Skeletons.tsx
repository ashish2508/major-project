'use client';

export function StatusSkeleton() {
  return (
    <div className="progress-note" style={{ animation: 'pulse 2s infinite' }}>
      <div style={{ height: '16px', background: '#ccc', borderRadius: '4px' }} />
    </div>
  );
}

export function CorpusStatsSkeleton() {
  return (
    <div className="corpus-stats-grid">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="corpus-stat-card" style={{ animation: 'pulse 2s infinite' }}>
          <div style={{ height: '12px', background: '#ddd', borderRadius: '4px', marginBottom: '8px' }} />
          <div style={{ height: '24px', background: '#ddd', borderRadius: '4px' }} />
        </div>
      ))}
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="results-section" style={{ animation: 'pulse 2s infinite' }}>
      <div style={{ height: '24px', background: '#ddd', borderRadius: '4px', marginBottom: '16px', width: '60%' }} />
      <div style={{ height: '120px', background: '#ddd', borderRadius: '8px' }} />
    </div>
  );
}

export function DocumentListSkeleton() {
  return (
    <div className="corpus-table-wrapper" style={{ animation: 'pulse 2s infinite' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ height: '40px', background: '#f0f0f0', marginBottom: '8px', borderRadius: '4px' }} />
      ))}
    </div>
  );
}

const pulseStyle = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = pulseStyle;
  document.head.appendChild(style);
}
