import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught an error:', error, errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={48} color="#ff9500" />
          <Text style={styles.title}>出现了意外错误</Text>
          <Text style={styles.message}>
            {this.state.error?.message || '应用遇到了一个未知的错误'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f6f7',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2329',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#646a73',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    height: 44,
    paddingHorizontal: 32,
    backgroundColor: '#3370ff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
