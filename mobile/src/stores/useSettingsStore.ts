import { create } from 'zustand';

interface SettingsState {
  theme: 'light' | 'dark' | 'auto';
  soundEnabled: boolean;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  setSoundEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'auto',
  soundEnabled: true,

  setTheme: (theme) => set({ theme }),
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
}));
