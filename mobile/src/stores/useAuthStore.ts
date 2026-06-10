import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '@/api/authApi';
import type { UserInfo } from '@/types';

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

function extractUserInfo(data: any): UserInfo {
  // Support both nested `user` field and flat fields
  if (data.user) {
    return {
      userId: data.user.userId || data.user.id || data.userId,
      username: data.user.username || data.user.name || data.username,
      avatar: data.user.avatar || data.avatar,
      email: data.user.email,
    };
  }
  return {
    userId: data.userId,
    username: data.username,
    avatar: data.avatar,
  };
}

interface AuthState {
  isAuthenticated: boolean | null;
  token: string | null;
  userInfo: UserInfo | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: null,
  token: null,
  userInfo: null,

  login: async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    await tokenStore.setItem('auth_token', data.token);
    set({ isAuthenticated: true, token: data.token, userInfo: extractUserInfo(data) });
  },

  register: async (username: string, email: string, password: string) => {
    const data = await authApi.register(username, email, password);
    await tokenStore.setItem('auth_token', data.token);
    set({ isAuthenticated: true, token: data.token, userInfo: extractUserInfo(data) });
  },

  loginAsGuest: async () => {
    const data = await authApi.loginAsGuest();
    await tokenStore.setItem('auth_token', data.token);
    set({ isAuthenticated: true, token: data.token, userInfo: extractUserInfo(data) });
  },

  logout: () => {
    tokenStore.deleteItem('auth_token');
    set({ isAuthenticated: false, token: null, userInfo: null });
  },

  checkAuth: async () => {
    try {
      const token = await tokenStore.getItem('auth_token');
      if (!token) {
        set({ isAuthenticated: false, token: null });
        return;
      }

      // 向后端验证 token 是否仍然有效
      // 如果返回 401 则清除 token 跳到登录页
      try {
        const userJson = await tokenStore.getItem('auth_user');
        const userInfo = userJson ? JSON.parse(userJson) : null;

        // 调用一个轻量接口验证 token 有效性
        await authApi.verifyToken();
        set({ isAuthenticated: true, token, userInfo });
      } catch {
        // token 无效（401）或网络不可用
        console.warn('[AuthStore] token invalid or network unavailable, clearing auth');
        await tokenStore.deleteItem('auth_token');
        await tokenStore.deleteItem('auth_user');
        set({ isAuthenticated: false, token: null, userInfo: null });
      }
    } catch (error) {
      console.error('[AuthStore] checkAuth failed:', error);
      set({ isAuthenticated: false, token: null });
    }
  },
}));

// Also persist userInfo alongside token
const origSet = useAuthStore.setState;
useAuthStore.setState = (partial) => {
  origSet(partial);
  const state = useAuthStore.getState();
  if (state.userInfo) {
    tokenStore.setItem('auth_user', JSON.stringify(state.userInfo));
  }
};
