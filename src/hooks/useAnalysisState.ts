import { useContext } from 'react';
import { AnalysisStateContext } from '@/lib/contexts';

export function useAnalysisState() {
  const context = useContext(AnalysisStateContext);
  if (!context) {
    throw new Error('useAnalysisState must be used within AnalysisStateProvider');
  }
  return context;
}
