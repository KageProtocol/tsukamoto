import { createHmac, timingSafeEqual } from 'crypto';

const HMAC_SECRET = process.env.API_HMAC_SECRET || process.env.OTC_HMAC_SECRET;

if (!HMAC_SECRET || HMAC_SECRET.length < 32) {
  console.warn('⚠️  WARNING: API_HMAC_SECRET is not set or too short. HMAC validation will fail.');
}

/**
 * Generate HMAC signature for request data
 * @param data - The data to sign (typically orderId or request body)
 * @param timestamp - Unix timestamp (optional, for time-based validation)
 */
export function generateHmac(data: string, timestamp?: number): string {
  const payload = timestamp ? `${data}:${timestamp}` : data;
  const hmac = createHmac('sha256', HMAC_SECRET!);
  hmac.update(payload);
  return hmac.digest('hex');
}

/**
 * Validate HMAC signature from request headers
 * @param signature - The signature from X-HMAC-Signature header
 * @param data - The data that was signed
 * @param timestamp - Optional timestamp from X-HMAC-Timestamp header
 * @param maxAge - Maximum age of signature in seconds (default: 300 = 5 minutes)
 */
export function validateHmac(
  signature: string | null,
  data: string,
  timestamp?: string | null,
  maxAge: number = 300
): { valid: boolean; error?: string } {
  if (!HMAC_SECRET) {
    return { valid: false, error: 'HMAC secret not configured' };
  }

  if (!signature) {
    return { valid: false, error: 'Missing HMAC signature' };
  }

  // Validate timestamp if provided
  let ts: number | undefined;
  if (timestamp) {
    ts = parseInt(timestamp);
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
  }

  // Generate expected signature
  const expected = generateHmac(data, ts);

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

/**
 * Extract HMAC headers from request
 */
export function extractHmacHeaders(req: Request): {
  signature: string | null;
  timestamp: string | null;
} {
  return {
    signature: req.headers.get('X-HMAC-Signature'),
    timestamp: req.headers.get('X-HMAC-Timestamp')
  };
}
