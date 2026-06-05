import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const { login, loginAsGuest } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('提示', '请输入邮箱和密码');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('提示', '请输入有效的电子邮箱');
      return;
    }
    
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (error: any) {
      console.error(error);
      Alert.alert('登录失败', error?.response?.data?.message || '邮箱或密码错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      await loginAsGuest();
    } catch (error) {
      console.error(error);
      Alert.alert('提示', '访客登录失败，已启用离线模拟登录');
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="sparkles" size={32} color="#fff" />
          </View>
          <Text style={styles.title}>AgentHub</Text>
          <Text style={styles.subtitle}>智能助手与多任务协作平台</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>邮箱登录</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>电子邮箱</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#8f959e" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="yourname@domain.com"
                placeholderTextColor="#8f959e"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.passwordHeader}>
              <Text style={styles.label}>密码</Text>
              <Text style={styles.hintText}>默认: admin@northcore.ai / admin123</Text>
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#8f959e" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="请输入密码"
                placeholderTextColor="#8f959e"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || guestLoading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>立即登录</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>或者</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={[styles.guestButton, guestLoading && styles.buttonDisabled]}
            onPress={handleGuestLogin}
            disabled={loading || guestLoading}
          >
            {guestLoading ? (
              <ActivityIndicator color="#3370ff" />
            ) : (
              <>
                <Text style={styles.guestButtonText}>✨ 访客快捷体验</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>版本 v3.5.0 © 2026 NorthCore Group</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6f7',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#3370ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#3370ff',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2329',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#646a73',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#1f2329',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#dee0e3',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2329',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2329',
    marginBottom: 6,
  },
  hintText: {
    fontSize: 10,
    color: '#8f959e',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dee0e3',
    borderRadius: 12,
    backgroundColor: '#f5f6f7',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1f2329',
  },
  button: {
    height: 48,
    backgroundColor: '#3370ff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#3370ff',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#dee0e3',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
    color: '#8f959e',
  },
  guestButton: {
    height: 48,
    borderWidth: 1,
    borderColor: '#3370ff',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestButtonText: {
    color: '#3370ff',
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: '#8f959e',
    marginTop: 32,
  },
});
