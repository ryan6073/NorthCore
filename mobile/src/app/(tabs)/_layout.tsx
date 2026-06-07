import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3370ff',
        tabBarInactiveTintColor: '#8f959e',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e8ecf3',
          height: 66,
          paddingTop: 6,
          paddingBottom: 10,
          shadowColor: '#1f2329',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.06,
          shadowRadius: 16,
          elevation: 12,
        },
        headerStyle: {
          backgroundColor: '#ffffff',
          borderBottomColor: '#e8ecf3',
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 17,
          color: '#111827',
        },
        headerTintColor: colors.text,
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: '会话',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
          headerTitle: '最近会话',
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: '联系人',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
          headerTitle: '联系人',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
          headerTitle: '个人设置',
        }}
      />
    </Tabs>
  );
}
