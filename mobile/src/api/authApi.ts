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
};
