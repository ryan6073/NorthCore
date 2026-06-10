import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '@/api/authApi';

const isWeb = Platform.OS === 'web';

const tokenStore = {
  async setItem(key: string, value: string) {
    if (isWeb) {
      localStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  },
  async getItem(key: string): Promise<string | null> {
    if (isWeb) {
      return localStorage.getItem(key);
    } else {
      return await SecureStore.getItemAsync(key);
    }
  },
  async deleteItem(key: string) {
    if (isWeb) {
      localStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  }
};

interface AuthState {
  isAuthenticated: boolean | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: null,
  token: null,

  login: async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    await tokenStore.setItem('auth_token', data.token);
    set({ isAuthenticated: true, token: data.token });
  },

  register: async (username: string, email: string, password: string) => {
    const data = await authApi.register(username, email, password);
    await tokenStore.setItem('auth_token', data.token);
    set({ isAuthenticated: true, token: data.token });
  },

  loginAsGuest: async () => {
    const data = await authApi.loginAsGuest();
    await tokenStore.setItem('auth_token', data.token);
    set({ isAuthenticated: true, token: data.token });
  },

  logout: () => {
    tokenStore.deleteItem('auth_token');
    set({ isAuthenticated: false, token: null });
  },

  checkAuth: async () => {
    try {
      const token = await tokenStore.getItem('auth_token');
      set({ isAuthenticated: !!token, token });
    } catch (error) {
      console.error('[AuthStore] checkAuth failed:', error);
      set({ isAuthenticated: false, token: null });
    }
  },
}));
