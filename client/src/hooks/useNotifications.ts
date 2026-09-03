import { useContext } from 'react';

import { NotificationContext } from '@/context/NotificationContext';

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error('useNotifications must be used inside a NotificationProvider');
  }

  return context;
}
