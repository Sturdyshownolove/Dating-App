/**
 * Format seconds into HH:MM:SS display
 */
export const formatTime = (totalSeconds: number): string => {
  if (totalSeconds <= 0) return '00:00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

export const formatTimeShort = (totalSeconds: number): string => {
  if (totalSeconds <= 0) return '0s';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
};

const pad = (n: number): string => n.toString().padStart(2, '0');

/**
 * Get remaining seconds from an expiry date
 */
export const getRemainingSeconds = (expiresAt: Date): number => {
  const now = new Date().getTime();
  const expires = expiresAt.getTime();
  return Math.max(0, Math.floor((expires - now) / 1000));
};

/**
 * Get timer color based on remaining percentage
 */
export const getTimerColor = (remaining: number, total: number) => {
  const pct = remaining / total;
  if (pct > 0.5) return '#2ED573';    // safe - green
  if (pct > 0.25) return '#FFA502';   // warning - orange
  return '#FF4757';                     // danger - red
};

/**
 * Format a Date for message timestamps
 */
export const formatMessageTime = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
};

/**
 * Format relative time for match list
 */
export const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};
