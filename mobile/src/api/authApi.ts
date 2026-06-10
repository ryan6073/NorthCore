import { request } from './httpClient';
import { LoginRequest, LoginResponse } from '@/types';

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      data: { email, password },
    });
    return res.data;
  },
  async register(username: string, email: string, password: string): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/register', {
      method: 'POST',
      data: { username, email, password },
    });
    return res.data;
  },
  async loginAsGuest(): Promise<LoginResponse> {
    const res = await request<LoginResponse>('/auth/guest', {
      method: 'POST',
    });
    return res.data;
  },

  /**
   * 验证当前 token 是否有效（轻量调用）
   * 401 时抛出异常，checkAuth 会据此清除 token
   */
  async verifyToken(): Promise<void> {
    await request<any>('/auth/me', { method: 'GET' });
  },
};
