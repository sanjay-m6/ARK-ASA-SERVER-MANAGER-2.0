import { create } from 'zustand';
import type { SystemInfo } from '../types';

interface UIStore {
  isLoading: boolean;
  systemInfo: SystemInfo | null;
  setLoading: (loading: boolean) => void;
  setSystemInfo: (info: SystemInfo) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isLoading: false,
  systemInfo: null,
  setLoading: (loading) => set({ isLoading: loading }),
  setSystemInfo: (info) => set({ systemInfo: info }),
}));
