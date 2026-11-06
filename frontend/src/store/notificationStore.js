import { create } from 'zustand';

/**
 * UI notification store – drives the notification bell unread count,
 * the offline/online indicator, the queued-notifications badge
 * and the WhatsApp connection chip. All values are fed by /api/health.
 */
export const useNotificationStore = create((set) => ({
  unreadCount: 0,
  isOnline: navigator.onLine,
  wahaConnected: false,
  queuedCount: 0,

  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  markAllRead: () => set({ unreadCount: 0 }),

  setOnline: (online) => set({ isOnline: online }),
  setWahaConnected: (connected) => set({ wahaConnected: connected }),
  setQueuedCount: (count) => set({ queuedCount: count }),
}));

// Listen for browser online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online',  () => useNotificationStore.getState().setOnline(true));
  window.addEventListener('offline', () => useNotificationStore.getState().setOnline(false));
}
