/** 获取当前北京时间（不依赖用户系统时区） */
function nowBeijing(): Date {
  const d = new Date();
  // UTC 时间 + 8 小时
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(utcMs + 8 * 3600000);
}

/** 北京时间格式：HH:MM */
export function getCurrentTimeLabel() {
  const bj = nowBeijing();
  return `${String(bj.getHours()).padStart(2, '0')}:${String(bj.getMinutes()).padStart(2, '0')}`;
}

/** 北京时间完整格式：YYYY-MM-DD HH:MM */
export function getCurrentFullTime() {
  const bj = nowBeijing();
  const y = bj.getFullYear();
  const M = String(bj.getMonth() + 1).padStart(2, '0');
  const d = String(bj.getDate()).padStart(2, '0');
  const h = String(bj.getHours()).padStart(2, '0');
  const m = String(bj.getMinutes()).padStart(2, '0');
  return `${y}-${M}-${d} ${h}:${m}`;
}
