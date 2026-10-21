
function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatTime12(value: string | Date): string {
  return toDate(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateOnly(value: string | Date): string {
  return toDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime12(value: string | Date): string {
  return `${formatDateOnly(value)}, ${formatTime12(value)}`;
}
