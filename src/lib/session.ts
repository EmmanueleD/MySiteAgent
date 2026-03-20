import crypto from 'node:crypto';

const SESSION_EXPIRY_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Creates a signed session token.
 *
 * Token format: {timestamp}.{16-byte-hex}
 * Cookie value: {token}.{HMAC-SHA256-base64url}
 *
 * @param password - The ADMIN_PASSWORD used as the HMAC signing key
 * @returns Signed session cookie value
 */
export function createSession(password: string): string {
  const timestamp = Date.now().toString();
  const random = crypto.randomBytes(16).toString('hex');
  const token = `${timestamp}.${random}`;
  const signature = sign(token, password);
  return `${token}.${signature}`;
}

/**
 * Verifies a session cookie value.
 *
 * @param cookieValue - The raw cookie string (may be undefined)
 * @param password - The ADMIN_PASSWORD used as the HMAC signing key
 * @returns true if the cookie is valid, correctly signed, and not expired
 */
export function verifySession(
  cookieValue: string | undefined,
  password: string
): boolean {
  if (!cookieValue || cookieValue.trim() === '') return false;

  // Split on the LAST dot to separate token from signature
  const lastDotIndex = cookieValue.lastIndexOf('.');
  if (lastDotIndex === -1) return false;

  const token = cookieValue.substring(0, lastDotIndex);
  const providedSig = cookieValue.substring(lastDotIndex + 1);

  if (!token || !providedSig) return false;

  // Verify HMAC signature (constant-time comparison)
  const expectedSig = sign(token, password);
  try {
    const expectedBuf = Buffer.from(expectedSig, 'base64url');
    const providedBuf = Buffer.from(providedSig, 'base64url');
    if (expectedBuf.length !== providedBuf.length) return false;
    if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) return false;
  } catch {
    return false;
  }

  // Verify timestamp (check expiry)
  const firstDotIndex = token.indexOf('.');
  if (firstDotIndex === -1) return false;

  const timestampStr = token.substring(0, firstDotIndex);
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const age = Date.now() - timestamp;
  if (age < 0 || age > SESSION_EXPIRY_MS) return false;

  return true;
}

/**
 * Signs a token with HMAC-SHA256 and returns a base64url-encoded signature.
 */
function sign(token: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(token)
    .digest('base64url');
}
