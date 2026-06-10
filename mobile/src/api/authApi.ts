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
   * 验证当前 token 是否有效，并返回用户信息
   * 401 时抛出异常，checkAuth 会据此清除 token
   */
  async verifyToken(): Promise<{ user?: { id?: string; name?: string; email?: string; avatar?: string }; userId?: string; username?: string; avatar?: string }> {
    const res = await request<any>('/auth/me', { method: 'GET' });
    return res.data;
  },
};
