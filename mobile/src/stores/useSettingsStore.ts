import { create } from 'zustand';
import { USE_MOCK } from '@/constants/config';

interface SettingsState {
  theme: 'light' | 'dark' | 'auto';
  soundEnabled: boolean;
  useMock: boolean;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  setSoundEnabled: (enabled: boolean) => void;
  setUseMock: (useMock: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'auto',
  soundEnabled: true,
  useMock: USE_MOCK,

  setTheme: (theme) => set({ theme }),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  setUseMock: (useMock) => set({ useMock }),
}));
