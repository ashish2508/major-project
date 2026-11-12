import { useContext } from 'react';
import { CorpusStateContext } from '@/lib/contexts';

export function useCorpusState() {
  const context = useContext(CorpusStateContext);
  if (!context) {
    throw new Error('useCorpusState must be used within CorpusStateProvider');
  }
  return context;
}
