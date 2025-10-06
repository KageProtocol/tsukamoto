import { createHmac, timingSafeEqual } from 'crypto';

const HMAC_SECRET = process.env.API_HMAC_SECRET || process.env.OTC_HMAC_SECRET;

if (!HMAC_SECRET || HMAC_SECRET.length < 32) {
  console.warn('⚠️  WARNING: API_HMAC_SECRET is not set or too short. HMAC validation will fail.');
}

/**
 * Generate HMAC signature for request data
 * @param method - HTTP method (GET, POST, DELETE, etc.)
 * @param path - Request path (e.g., "/order")
 * @param timestamp - Unix timestamp in seconds
 * @param body - Request body (empty string for GET/DELETE)
 */
export function generateHmac(method: string, path: string, timestamp: string, body: string): string {
  const payload = [method.toUpperCase(), path, timestamp, body].join('\n');
  const hmac = createHmac('sha256', HMAC_SECRET!);
  hmac.update(payload);
  return hmac.digest('hex');
}

/**
 * Validate HMAC signature from request headers
 * @param req - The request object
 * @param method - HTTP method
 * @param path - Request path
 * @param body - Request body (empty string for GET/DELETE)
 * @param maxAge - Maximum age of signature in seconds (default: 300 = 5 minutes)
 */
export function validateHmac(
  req: Request,
  method: string,
  path: string,
  body: string,
  maxAge: number = 300
): { valid: boolean; error?: string } {
  if (!HMAC_SECRET) {
    return { valid: false, error: 'HMAC secret not configured' };
  }

  const signature = req.headers.get('x-signature');
  const timestamp = req.headers.get('x-timestamp');

  if (!signature) {
    return { valid: false, error: 'Missing HMAC signature' };
  }

  if (!timestamp) {
    return { valid: false, error: 'Missing timestamp' };
  }

  // Validate timestamp
  const ts = parseInt(timestamp);
  if (isNaN(ts)) {
    return { valid: false, error: 'Invalid timestamp' };
  }

  const now = Math.floor(Date.now() / 1000);
  const age = now - ts;

  if (age > maxAge) {
    return { valid: false, error: 'Signature expired' };
  }

  if (age < -60) {
    return { valid: false, error: 'Signature timestamp is in the future' };
  }

  // Generate expected signature
  const expected = generateHmac(method, path, timestamp, body);

  // Timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'Invalid signature format' };
    }

    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);
    return isValid ? { valid: true } : { valid: false, error: 'Invalid signature' };
  } catch (err) {
    return { valid: false, error: 'Signature validation error' };
  }
}

