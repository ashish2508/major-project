import { useContext } from 'react';
import { FormStateContext } from '@/lib/contexts';

export function useFormState() {
  const context = useContext(FormStateContext);
  if (!context) {
    throw new Error('useFormState must be used within FormStateProvider');
  }
  return context;
}
