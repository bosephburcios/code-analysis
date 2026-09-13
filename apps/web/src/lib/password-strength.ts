// A lightweight complexity estimate, not a guarantee of password security.
export function passwordStrength(password: string) {
  if (!password) return 0;
  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(pattern => pattern.test(password)).length;
  let score = [8, 12, 16, 20].filter(length => password.length >= length).length;
  if (password.length >= 12 && variety >= 3) score++;
  if (/(password|qwerty|letmein|123456|abcdef)/i.test(password) || /^(.{1,4})\1+$/.test(password)) score = Math.min(score, 1);
  return Math.max(1, Math.min(score, 4));
}
