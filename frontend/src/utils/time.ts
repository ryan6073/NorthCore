export function getCurrentTimeLabel() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getCurrentFullTime() {
  return new Date().toLocaleString('zh-CN');
}
