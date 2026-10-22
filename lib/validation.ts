
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72;

const COMMON_WORDS = [
  'password', 'passw0rd', 'qwerty', 'asdfgh', 'zxcvbn', 'letmein', 'welcome',
  'iloveyou', 'admin', 'login', 'master', 'dragon', 'monkey', 'football',
  'baseball', 'superman', 'batman', 'princess', 'sunshine', 'shadow', 'abc123',
  'trustno1', 'whatever', 'freedom', 'secret', 'student', 'teacher', 'school',
  'attendance', 'qratt',
];

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Email is required.';
  if (!EMAIL_RE.test(value)) return 'Please enter a valid email address.';
  return null;
}

export type PasswordContext = {
  email?: string;
  fullName?: string;
};

export type PasswordCheck = {
  id: string;
  label: string;
  message: string;
  ok: boolean;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[$5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

function hasRun(password: string, length: number) {
  const s = password.toLowerCase();
  let up = 1;
  let down = 1;
  for (let i = 1; i < s.length; i++) {
    const diff = s.charCodeAt(i) - s.charCodeAt(i - 1);
    up = diff === 1 ? up + 1 : 1;
    down = diff === -1 ? down + 1 : 1;
    if (up >= length || down >= length) return true;
  }
  return false;
}

function isPredictable(password: string) {
  if (/(.)\1{3,}/.test(password)) return true;
  if (hasRun(password, 4)) return true;
  const flat = normalize(password);
  return COMMON_WORDS.some((word) => flat.includes(normalize(word)));
}

function containsPersonalInfo(password: string, ctx: PasswordContext) {
  const flat = normalize(password);
  const parts: string[] = [];
  const local = ctx.email?.split('@')[0];
  if (local) parts.push(local);
  if (ctx.fullName) parts.push(...ctx.fullName.split(/\s+/));
  return parts
    .map(normalize)
    .filter((p) => p.length >= 3)
    .some((p) => flat.includes(p));
}

export function getPasswordChecks(
  password: string,
  ctx: PasswordContext = {}
): PasswordCheck[] {
  const checks: PasswordCheck[] = [
    {
      id: 'length',
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      ok: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'lower',
      label: 'A lowercase letter',
      message: 'Password must contain a lowercase letter.',
      ok: /[a-z]/.test(password),
    },
    {
      id: 'upper',
      label: 'An uppercase letter',
      message: 'Password must contain an uppercase letter.',
      ok: /[A-Z]/.test(password),
    },
    {
      id: 'number',
      label: 'A number',
      message: 'Password must contain a number.',
      ok: /[0-9]/.test(password),
    },
    {
      id: 'special',
      label: 'A special character (! @ # $ % ...)',
      message: 'Password must contain a special character (! @ # $ % ...).',
      ok: /[^A-Za-z0-9\s]/.test(password),
    },
    {
      id: 'predictable',
      label: 'No common words, repeats or sequences',
      message:
        'Password is too predictable. Avoid common words, repeated characters and sequences like 1234 or abcd.',
      ok: password.length > 0 && !isPredictable(password),
    },
  ];

  if (ctx.email?.trim() || ctx.fullName?.trim()) {
    checks.push({
      id: 'personal',
      label: 'Does not contain your name or email',
      message: 'Password must not contain your name or email.',
      ok: password.length > 0 && !containsPersonalInfo(password, ctx),
    });
  }

  return checks;
}

export function validatePassword(
  password: string,
  ctx: PasswordContext = {}
): string | null {
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  const failed = getPasswordChecks(password, ctx).find((c) => !c.ok);
  return failed ? failed.message : null;
}
