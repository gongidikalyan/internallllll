const ROLE_PREFIX_MAP: Record<string, string> = {
  ceo: 'CEO',
  administrator: 'ADMIN',
  admin: 'ADMIN',
  cto: 'CTO',
  cpo: 'CPO',
  cbo: 'CBO',
  finance_manager: 'FIN',
  product_manager: 'PM',
  project_manager: 'PJM',
  team_member: 'EMP',
};

export function getRolePasswordPrefix(roleSlugOrName?: string | null): string {
  if (!roleSlugOrName) return 'USR';
  const normalized = roleSlugOrName.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (ROLE_PREFIX_MAP[normalized]) {
    return ROLE_PREFIX_MAP[normalized];
  }
  const lettersOnly = roleSlugOrName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (lettersOnly.length >= 2) {
    return lettersOnly.slice(0, 4);
  }
  return 'USR';
}

export function generateRandomNumberPassword(roleSlugOrName?: string | null): string {
  const prefix = getRolePasswordPrefix(roleSlugOrName);
  const buffer = new Uint32Array(1);
  window.crypto.getRandomValues(buffer);
  const fourDigits = String(buffer[0] % 10000).padStart(4, '0');
  return `${prefix}@${fourDigits}`;
}

export function generateSaltHex(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const payload = `${salt}:${password}`;
  if (window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback deterministic mixing only if subtle crypto is unavailable in non-secure origins
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export async function verifyPasswordHash(
  password: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  const candidate = await hashPassword(password, salt);
  if (candidate.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}
