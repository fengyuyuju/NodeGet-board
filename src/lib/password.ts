export function generatePassword(length: number = 16): string {
  // 后端 0.5.17 起 username/password 禁止包含 ':' 或 '|'，charset 需排除
  const charset = [
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{};,.<>?",
  ];

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  let password = "";

  for (let i = 0; i < length; i++) {
    password += charset[(randomValues[i] as number) % charset.length];
  }

  return password;
}
