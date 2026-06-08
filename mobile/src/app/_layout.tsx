import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { useAgentStore } from '@/stores/useAgentStore';

export default function RootLayout() {
  const { isAuthenticated, token, checkAuth } = useAuthStore();
  const { connectWS, disconnectWS } = useMessageStore();
  const { fetchAgents } = useAgentStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  // WS lifecycle: connect when authenticated, disconnect on logout
  useEffect(() => {
    if (isAuthenticated && token) {
      // Small delay to let routing settle, then connect WS + load agents
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
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (isAuthenticated === null) return;

    const inAuthGroup = segments[0] === 'login';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && (inAuthGroup || segments.length === 0 || segments[0] === undefined)) {
      router.replace('/(tabs)/chats');
    }
  }, [isAuthenticated, segments]);

  if (isAuthenticated === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chats/[conversationId]" options={{ headerShown: true }} />
      <Stack.Screen name="chats/settings" options={{ headerShown: true }} />
      <Stack.Screen name="chats/create" options={{ headerShown: true }} />
      <Stack.Screen name="agents/create" options={{ headerShown: true }} />
      <Stack.Screen name="agents/[agentId]" options={{ headerShown: true }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
    </Stack>
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
