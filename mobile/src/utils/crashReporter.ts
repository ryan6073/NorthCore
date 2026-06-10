/**
 * 崩溃日志捕获工具（轻量版——不可在模块顶层执行！）
 *
 * 使用方式：
 *   在 RootLayout 的 useEffect 中调用 initCrashReporter()
 */

import { Platform } from 'react-native';

let initialized = false;

export function initCrashReporter() {
  if (initialized) return;
  initialized = true;

  console.log('[CrashReporter] 🟢 崩溃日志捕获已启动');

  // ── 1. 全局未捕获异常 ──
  if (typeof ErrorUtils !== 'undefined' && ErrorUtils.setGlobalHandler) {
    const originalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      console.log('========================================');
      console.log(`🚨 [CrashReporter] FATAL: ${error?.message || String(error)}`);
      console.log(`📚 Stack:\n${error?.stack || '(no stack)'}`);
      console.log('========================================');
      if (originalHandler) originalHandler(error, isFatal);
    });
  }

  // ── 2. Web 端全局异常 ──
  if (Platform.OS === 'web') {
    window.addEventListener('error', (e) => {
      console.error('[CrashReporter] 🚨 WINDOW_ERROR:', e.message, e.error?.stack);
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[CrashReporter] 🚨 PROMISE_REJECTION:', e.reason?.message, e.reason?.stack);
    });
  }
}
