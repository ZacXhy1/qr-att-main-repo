// Shared input validation. Each function returns an error message,
// or null when the value is fine.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MIN_LENGTH = 8;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Email is required.';
  if (!EMAIL_RE.test(value)) return 'Please enter a valid email address.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}
