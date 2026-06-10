import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initCrashReporter } from '@/utils/crashReporter';

export default function RootLayout() {
  // 🔍 注意：不要用 try/catch 包 hooks！会违反 Rules of Hooks
  const { isAuthenticated, token, checkAuth } = useAuthStore();
  const { connectWS, disconnectWS } = useMessageStore();
  const { fetchAgents } = useAgentStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    try {
      initCrashReporter();
    } catch (e) {
      console.error('[RootLayout] crashReporter error:', e);
    }
    checkAuth();
  }, []);

  // WS lifecycle: connect when authenticated, disconnect on logout
  useEffect(() => {
    try {
      if (isAuthenticated && token) {
        const timer = setTimeout(() => {
          connectWS(token);
          fetchAgents();
        }, 500);
        return () => {
          clearTimeout(timer);
          disconnectWS();
        };
      } else if (isAuthenticated === false) {
        disconnectWS();
      }
    } catch (e) {
      console.error('[RootLayout] 🚨 WS lifecycle error:', e);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (isAuthenticated === null) return;
    try {
      const inAuthGroup = segments[0] === 'login';
      if (!isAuthenticated && !inAuthGroup) {
        router.replace('/login');
      } else if (isAuthenticated && (inAuthGroup || segments.length === 0 || segments[0] === undefined)) {
        router.replace('/(tabs)/chats');
      }
    } catch (e) {
      console.error('[RootLayout] 🚨 routing error:', e);
    }
  }, [isAuthenticated, segments]);

  if (isAuthenticated === null) {
    return (
      <ErrorBoundary>
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#208AEF" />
        </View>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chats/[conversationId]" options={{ headerShown: true }} />
        <Stack.Screen name="chats/settings" options={{ headerShown: true }} />
        <Stack.Screen name="chats/create" options={{ headerShown: true }} />
        <Stack.Screen name="agents/create" options={{ headerShown: true }} />
        <Stack.Screen name="agents/[agentId]" options={{ headerShown: true }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
