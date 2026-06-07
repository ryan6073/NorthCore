import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@/constants/config';

interface AuthImageProps {
  uri: string;
  style?: any;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  onError?: () => void;
  onLoad?: () => void;
  onLoadEnd?: () => void;
}

const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  const baseOrigin = API_BASE_URL.replace('/api/v1', '');

  if (
    url.startsWith('http://') ||
    url.startsWith('https://')
  ) {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === 'localhost' && urlObj.port === '9007') {
        const baseObj = new URL(baseOrigin);
        urlObj.protocol = baseObj.protocol;
        urlObj.hostname = baseObj.hostname;
        urlObj.port = baseObj.port;
        return urlObj.toString();
      }
    } catch {
      return url;
    }
    return url;
  }

  if (
    url.startsWith('file://') ||
    url.startsWith('content://') ||
    url.startsWith('data:')
  ) {
    return url;
  }

  if (url.startsWith('/api/v1')) return `${baseOrigin}${url}`;
  if (url.startsWith('/')) return `${baseOrigin}${url}`;
  return `${API_BASE_URL}/${url}`;
};

const normalizeNativeImageUrl = (url: string): string => {
  if (Platform.OS === 'web') return url;

  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'api.dicebear.com') {
      urlObj.pathname = urlObj.pathname.replace(/\/svg$/i, '/png');
      return urlObj.toString();
    }
  } catch {
    return url;
  }

  return url;
};

const isSameApiOrigin = (url: string): boolean => {
  try {
    const baseOrigin = API_BASE_URL.replace('/api/v1', '');
    return new URL(url).origin === new URL(baseOrigin).origin;
  } catch {
    return false;
  }
};

const getStoredToken = async () => {
  if (Platform.OS === 'web') return localStorage.getItem('auth_token');
  return SecureStore.getItemAsync('auth_token');
};

export default function AuthImage({
  uri,
  style,
  resizeMode = 'cover',
  onError,
  onLoad,
  onLoadEnd,
}: AuthImageProps) {
  const [source, setSource] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      const resolvedUrl = normalizeNativeImageUrl(resolveImageUrl(uri));
      if (!resolvedUrl) {
        setFailed(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setFailed(false);

      const token = await getStoredToken().catch(() => null);
      const headers =
        token && isSameApiOrigin(resolvedUrl)
          ? { Authorization: `Bearer ${token}` }
          : undefined;

      if (!cancelled) {
        setSource({ uri: resolvedUrl, headers });
        setLoading(false);
      }
    };

    prepare();

    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (loading) {
    return (
      <View style={[styles.image, styles.placeholder, style]}>
        <ActivityIndicator size="small" color="#3370ff" />
      </View>
    );
  }

  if (failed || !source) {
    return (
      <View style={[styles.image, styles.placeholder, style]}>
        <Ionicons name="image-outline" size={20} color="#94a3b8" />
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={[styles.image, style]}
      resizeMode={resizeMode}
      onLoad={() => onLoad?.()}
      onLoadEnd={() => onLoadEnd?.()}
      onError={() => {
        setFailed(true);
        onError?.();
      }}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
});
