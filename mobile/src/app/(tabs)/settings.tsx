import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const { logout } = useAuthStore();

  const handleLogout = () => {
    const performLogout = () => {
      logout();
    };

    if (Platform.OS === 'web') {
      if (window.confirm('确认退出登录吗？')) {
        performLogout();
      }
    } else {
      Alert.alert('提示', '确认退出登录吗？', [
        { text: '取消', style: 'cancel' },
        {
          text: '确认',
          style: 'destructive',
          onPress: performLogout,
        },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>U</Text>
        </View>
        <Text style={styles.username}>管理员</Text>
        <Text style={styles.role}>智能平台成员</Text>
      </View>

      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Ionicons name="notifications-outline" size={20} color="#666" />
            <Text style={styles.menuText}>通知设置</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#666" />
            <Text style={styles.menuText}>隐私与安全</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Ionicons name="help-circle-outline" size={20} color="#666" />
            <Text style={styles.menuText}>帮助与反馈</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6f7',
    padding: 16,
  },
  profileSection: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#3370ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2329',
    marginBottom: 4,
  },
  role: {
    fontSize: 14,
    color: '#646a73',
  },
  menuSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f6f7',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuText: {
    fontSize: 16,
    color: '#1f2329',
  },
  logoutButton: {
    backgroundColor: '#ff3b30',
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
