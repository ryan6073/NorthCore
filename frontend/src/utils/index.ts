export const formatTime = (timestamp: string): string => {
  return timestamp;
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 10);
};
