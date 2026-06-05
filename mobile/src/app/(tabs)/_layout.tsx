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
          backgroundColor: colors.background,
          borderTopColor: '#dee0e3',
          height: 60,
          paddingBottom: 8,
        },
        headerStyle: {
          backgroundColor: colors.background,
          borderBottomColor: '#dee0e3',
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
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
