// Shared date/time formatting. Everything is shown in 12-hour time (AM/PM)
// so the whole app looks the same, regardless of the phone's clock setting.

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** e.g. "3:45 PM" */
export function formatTime12(value: string | Date): string {
  return toDate(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** e.g. "Oct 19, 2026" */
export function formatDateOnly(value: string | Date): string {
  return toDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** e.g. "Oct 19, 2026, 3:45 PM" */
export function formatDateTime12(value: string | Date): string {
  return `${formatDateOnly(value)}, ${formatTime12(value)}`;
}
