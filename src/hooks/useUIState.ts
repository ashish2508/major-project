import { useContext } from 'react';
import { UIStateContext } from '@/lib/contexts';

export function useUIState() {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('useUIState must be used within UIStateProvider');
  }
  return context;
}
