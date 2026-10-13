import { BLOCKED_LINK_PATTERNS } from '@/constants/config';

export const validateEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePhone = (phone: string): boolean => {
  const re = /^\+[1-9]\d{6,14}$/;
  return re.test(phone.replace(/\s/g, ''));
};

// Password policy (audit S1-6 — NIST 800-63B-aligned):
//   - minimum 10 characters (above Firebase Auth's 6-char floor)
//   - at least one uppercase, one lowercase, one digit
//   - symbol NOT required (reduces user friction without meaningful
//     security loss vs. the length + class diversity)
// Breached-password check via HIBP k-anon API is the next step;
// requires a SHA-1 dependency decision and is deferred.
export const validatePassword = (password: string): { valid: boolean; error?: string } => {
  if (password.length < 10) {
    return { valid: false, error: 'Password must be at least 10 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Add at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Add at least one lowercase letter' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: 'Add at least one number' };
  }
  return { valid: true };
};

export const validateBio = (bio: string): { valid: boolean; error?: string } => {
  if (bio.length > 500) return { valid: false, error: 'Bio must be under 500 characters' };
  if (containsSocialLinks(bio)) {
    return { valid: false, error: 'Social media links are not allowed in your bio' };
  }
  return { valid: true };
};

export const containsSocialLinks = (text: string): boolean => {
  return BLOCKED_LINK_PATTERNS.some((pattern) => pattern.test(text));
};

export const validateAge = (age: number): boolean => {
  return age >= 18 && age <= 100;
};

export const validateName = (name: string): { valid: boolean; error?: string } => {
  if (name.trim().length < 2) return { valid: false, error: 'Name must be at least 2 characters' };
  if (name.trim().length > 30) return { valid: false, error: 'Name must be under 30 characters' };
  return { valid: true };
};
