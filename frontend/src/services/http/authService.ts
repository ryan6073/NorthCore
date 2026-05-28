import http from '@/services/index';
import type { BaseApiResponse } from '@/types';

export interface UserInfo {
  id?: string;
  name: string;
  email: string;
  avatar: string;
}

export interface AuthResponseData {
  token: string;
  user: UserInfo;
}

export async function registerApi(payload: any): Promise<BaseApiResponse<AuthResponseData>> {
  return await http.post('/auth/register', payload);
}

export async function loginApi(payload: any): Promise<BaseApiResponse<AuthResponseData>> {
  return await http.post('/auth/login', payload);
}

export async function loginAsGuestApi(payload?: any): Promise<BaseApiResponse<AuthResponseData>> {
  return await http.post('/auth/guest', payload);
}

export async function getMeApi(): Promise<BaseApiResponse<UserInfo>> {
  return await http.get('/auth/me');
}

export async function logoutApi(): Promise<BaseApiResponse<any>> {
  return await http.post('/auth/logout');
}

export async function updateProfileApi(payload: Partial<UserInfo>): Promise<BaseApiResponse<UserInfo>> {
  return await http.put('/auth/profile', payload);
}

const authService = {
  registerApi,
  loginApi,
  loginAsGuestApi,
  getMeApi,
  logoutApi,
  updateProfileApi,
};

export default authService;
