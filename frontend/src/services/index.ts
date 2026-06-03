import axios from 'axios';
import type { BaseApiResponse } from '@/types';

let baseURL: string = '/api/v1';
try {
  baseURL = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';
} catch {
  baseURL = '/api/v1';
}

const USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK === 'true';

export let storeLogger: any = null;
export function registerHttpLogger(logger: any) {
  storeLogger = logger;
}

const http = axios.create({
  baseURL,
  timeout: 120000,
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
    
    // Log sandbox relevant HTTP requests
    if (storeLogger && config.url && (config.url.includes('/runs') || config.url.includes('/conversations/'))) {
      try {
        storeLogger('http_req', config.url, config.data || null, config.method?.toUpperCase());
      } catch (err) {
        // ignore
      }
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
    
    // Log sandbox relevant HTTP responses
    if (storeLogger && response.config.url && (response.config.url.includes('/runs') || response.config.url.includes('/conversations/'))) {
      try {
        storeLogger('http_res', response.config.url, res, response.config.method?.toUpperCase());
      } catch (err) {
        // ignore
      }
    }
    return res as any;
  },
  (error) => {
    console.error('[HTTP Request Failed]', error);
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
    }
    
    // Log sandbox relevant HTTP errors
    if (storeLogger && error.config?.url && (error.config.url.includes('/runs') || error.config.url.includes('/conversations/'))) {
      try {
        storeLogger('http_err', error.config.url, error.response?.data || error.message, error.config.method?.toUpperCase());
      } catch (err) {
        // ignore
      }
    }
    return Promise.reject(error);
  }
);

export default http;
export { USE_MOCK };
