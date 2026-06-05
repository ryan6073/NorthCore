import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@/constants/config';
import { BaseApiResponse } from '@/types';

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

const getStoredToken = async () => {
  if (isWeb) return localStorage.getItem('auth_token');
  return await SecureStore.getItemAsync('auth_token');
};

const removeStoredToken = async () => {
  if (isWeb) localStorage.removeItem('auth_token');
  else await SecureStore.deleteItemAsync('auth_token');
};

httpClient.interceptors.request.use(
  async (config) => {
    const token = await getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeStoredToken();
    }
    return Promise.reject(error);
  }
);

export async function request<T>(url: string, config?: any): Promise<BaseApiResponse<T>> {
  const response = await httpClient(url, config);
  return response.data;
}

export default httpClient;
