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
            <View style={styles.menuIcon}>
              <Ionicons name="notifications-outline" size={18} color="#3370ff" />
            </View>
            <Text style={styles.menuText}>通知设置</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <View style={styles.menuIcon}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#3370ff" />
            </View>
            <Text style={styles.menuText}>隐私与安全</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <View style={styles.menuIcon}>
              <Ionicons name="help-circle-outline" size={18} color="#3370ff" />
            </View>
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
    backgroundColor: '#f6f8fb',
    padding: 16,
  },
  profileSection: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 24,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 26,
    backgroundColor: '#3370ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
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
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 8,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e8ecf3',
    shadowColor: '#1f2329',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2329',
  },
  logoutButton: {
    backgroundColor: '#ff3b30',
    borderRadius: 14,
    paddingVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff3b30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#edf4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
