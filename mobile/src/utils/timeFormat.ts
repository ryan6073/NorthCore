/**
 * 时间格式化工具
 *
 * 与 frontend 保持一致的处理逻辑：
 *
 * 会话列表：
 *   今天       → HH:MM
 *   今年       → MM-DD
 *   今年以前    → YYYY-MM-DD
 *
 * 聊天内时间分隔：
 *   今天       → "今天 HH:MM"
 *   昨天       → "昨天 HH:MM"
 *   更早       → "YYYY年M月D日 HH:MM"
 *
 * 两条消息之间超过 5 分钟或跨天 → 显示时间分隔
 */

/**
 * 格式化会话列表时间
 * 输入 "YYYY-MM-DD HH:mm:ss" 或 "YYYY-MM-DDTHH:mm:ss"
 */
export function formatConversationTime(timestamp: string): string {
  if (!timestamp) return '';

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const parts = timestamp.replace('T', ' ').split(' ');
  const datePart = parts[0] || '';
  const timePart = parts[1] || '';

  // 今天：显示 HH:MM
  if (datePart === today) {
    return timePart ? timePart.substring(0, 5) : '';
  }

  // 今年：显示 MM-DD
  const year = datePart.substring(0, 4);
  if (year === String(now.getFullYear())) {
    return datePart.substring(5); // "MM-DD"
  }

  // 今年以前：显示 YYYY-MM-DD
  return datePart;
}

/**
 * 聊天内时间分隔标签
 * 输入 "YYYY-MM-DD HH:mm:ss" 或 ISO 字符串
 */
export function formatTimeDivider(timestamp: string): string {
  if (!timestamp) return '';

  const date = parseMessageTime(timestamp);
  if (!date) return '';

  const now = new Date();
  const todayStr = getDateStr(now);

  const isToday = getDateStr(date) === todayStr;
  const isYesterday = getDateStr(date) === getDateStr(new Date(now.getTime() - 86400000));

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (isToday) return `今天 ${timeStr}`;
  if (isYesterday) return `昨天 ${timeStr}`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
}

/**
 * 判断两条消息之间是否需要显示时间分隔
 * 跨天 / 超过 5 分钟 → true
 */
export function shouldShowTimeDivider(
  currentTimestamp: string,
  previousTimestamp?: string | null
): boolean {
  if (!previousTimestamp) return true;

  const current = parseMessageTime(currentTimestamp);
  const previous = parseMessageTime(previousTimestamp);
  if (!current || !previous) return true;

  // 跨天
  if (!isSameDay(current, previous)) return true;

  // 超过 5 分钟
  return current.getTime() - previous.getTime() > 5 * 60 * 1000;
}

// ===== 内部辅助 =====

function parseMessageTime(timestamp: string): Date | null {
  if (!timestamp) return null;
  try {
    const cleaned = timestamp.replace('T', ' ').replace(/\.[0-9]{3}Z$/, '').replace(/Z$/, '');
    // Support "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm"
    const date = new Date(cleaned);
    if (isNaN(date.getTime())) {
      // Try "YYYY-MM-DD" only
      const d = new Date(cleaned.substring(0, 10));
      return isNaN(d.getTime()) ? null : d;
    }
    return date;
  } catch {
    return null;
  }
}

function getDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
