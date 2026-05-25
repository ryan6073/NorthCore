import axios from 'axios';
import type { BaseApiResponse } from '@/types';

let baseURL: string = '/api/v1';
try {
  baseURL = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';
} catch {
  baseURL = '/api/v1';
}

const USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK === 'true';

const http = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

http.interceptors.response.use(
  (response) => {
    const res = response.data as BaseApiResponse;
    if (res.code !== 0) {
      console.warn('[API Error]', res);
    }
    return res as any;
  },
  (error) => {
    console.error('[HTTP Request Failed]', error);
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
    }
    return Promise.reject(error);
  }
);

export default http;
export { USE_MOCK };
