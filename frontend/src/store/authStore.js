import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Auth store – persisted to localStorage so page reloads keep the user logged in.
 * The JWT lives in an httpOnly cookie; we only store non-sensitive user info here.
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,

      setUser: (user) => set({ isAuthenticated: true, user }),
      clearUser: () => set({ isAuthenticated: false, user: null }),
    }),
    {
      name: 'msl-auth',
      partialize: (state) => ({ isAuthenticated: state.isAuthenticated, user: state.user }),
    }
  )
);
