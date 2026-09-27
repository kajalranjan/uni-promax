// Sign-up / log-in rules from the spec. The database enforces the same rules,
// so these checks are for friendly messages, not security.

export const USERNAME_MIN = 3;
export const PASSWORD_MIN = 8;

export type SignUpForm = {
  fullName: string;
  major: string;
  age: string;
  email: string;
  username: string;
  password: string;
};

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function validateSignUp(f: SignUpForm): FieldErrors<SignUpForm> {
  const e: FieldErrors<SignUpForm> = {};
  if (!f.fullName.trim()) e.fullName = 'Enter your name';
  if (!f.major.trim()) e.major = 'Enter your major';

  const age = Number(f.age);
  if (!f.age.trim()) e.age = 'Enter your age';
  else if (!Number.isInteger(age) || age < 13 || age > 120) e.age = 'Enter a valid age';

  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';

  const u = f.username.trim();
  if (u.length < USERNAME_MIN) e.username = `Username must be at least ${USERNAME_MIN} characters`;
  else if (!/^[A-Za-z0-9_.]+$/.test(u)) e.username = 'Use only letters, numbers, _ and .';

  if (f.password.length < PASSWORD_MIN) e.password = `Password must be at least ${PASSWORD_MIN} characters`;
  return e;
}
