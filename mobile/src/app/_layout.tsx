import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/useAuthStore';

export default function RootLayout() {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

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
