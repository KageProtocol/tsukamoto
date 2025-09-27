import crypto from "crypto";

// In-memory store for rate limiting
const rateLimitStore = new Map<string, { requests: number; lastReset: number; nonces: Set<string> }>();

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  enableNonceStore: boolean; // Whether to store nonces for replay protection
  nonceExpiryMs: number; // How long to keep nonces
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  enableNonceStore: true,
  nonceExpiryMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * Check if a request should be rate limited based on HMAC key
 */
export function checkRateLimit(
  hmacKey: string,
  timestamp: string,
  nonce?: string,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; error?: string; remaining?: number } {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  // Create a hash of the HMAC key to use as identifier (for privacy)
  const keyId = crypto.createHash("sha256").update(hmacKey).digest("hex").slice(0, 16);

  // Get or initialize rate limit data
  let limitData = rateLimitStore.get(keyId);
  if (!limitData) {
    limitData = {
      requests: 0,
      lastReset: now,
      nonces: new Set<string>(),
    };
    rateLimitStore.set(keyId, limitData);
  }

  // Reset window if expired
  if (now - limitData.lastReset >= fullConfig.windowMs) {
    limitData.requests = 0;
    limitData.lastReset = now;
    limitData.nonces.clear();
  }

  // Check for nonce replay if enabled
  if (fullConfig.enableNonceStore && nonce) {
    const nonceKey = `${timestamp}-${nonce}`;
    if (limitData.nonces.has(nonceKey)) {
      return { allowed: false, error: "Duplicate nonce detected" };
    }

    // Add nonce and clean old ones
    limitData.nonces.add(nonceKey);

    // Clean old nonces (simple cleanup every 100 requests)
    if (limitData.requests % 100 === 0) {
      const cutoff = now - fullConfig.nonceExpiryMs;
      const tsLimit = Math.floor(cutoff / 1000);

      for (const storedNonce of limitData.nonces) {
        const [tsStr] = storedNonce.split('-');
        if (parseInt(tsStr) < tsLimit) {
          limitData.nonces.delete(storedNonce);
        }
      }
    }
  }

  // Check rate limit
  if (limitData.requests >= fullConfig.maxRequests) {
    return {
      allowed: false,
      error: `Rate limit exceeded. Max ${fullConfig.maxRequests} requests per ${fullConfig.windowMs}ms`,
      remaining: 0,
    };
  }

  // Increment request count
  limitData.requests++;

  return {
    allowed: true,
    remaining: fullConfig.maxRequests - limitData.requests,
  };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(
  hmacKey: string,
  config: Partial<RateLimitConfig> = {}
): Record<string, string> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const keyId = crypto.createHash("sha256").update(hmacKey).digest("hex").slice(0, 16);
  const limitData = rateLimitStore.get(keyId);

  if (!limitData) {
    return {
      "X-RateLimit-Limit": fullConfig.maxRequests.toString(),
      "X-RateLimit-Remaining": fullConfig.maxRequests.toString(),
      "X-RateLimit-Reset": Math.ceil((Date.now() + fullConfig.windowMs) / 1000).toString(),
    };
  }

  const remaining = Math.max(0, fullConfig.maxRequests - limitData.requests);
  const resetTime = Math.ceil((limitData.lastReset + fullConfig.windowMs) / 1000);

  return {
    "X-RateLimit-Limit": fullConfig.maxRequests.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": resetTime.toString(),
  };
}

/**
 * Extract HMAC key from request for rate limiting
 */
export function extractHmacKey(req: Request): string | null {
  const signature = req.headers.get("x-signature");
  const timestamp = req.headers.get("x-timestamp");

  if (!signature || !timestamp) return null;

  // For rate limiting purposes, we'll use the signature as the key identifier
  // In a real implementation, you might want to use a proper API key system
  return signature;
}

/**
 * Middleware wrapper for rate limiting
 */
export function withRateLimit(
  handler: (req: Request) => Promise<Response>,
  config?: Partial<RateLimitConfig>
) {
  return async (req: Request): Promise<Response> => {
    const hmacKey = extractHmacKey(req);

    if (!hmacKey) {
      // If no HMAC key, apply a more restrictive IP-based rate limit
      // For now, we'll skip this and let it through
      return handler(req);
    }

    // Extract nonce from signature for replay protection
    const timestamp = req.headers.get("x-timestamp") || "";
    const nonce = req.headers.get("x-nonce"); // Optional nonce header

    const rateCheck = checkRateLimit(hmacKey, timestamp, nonce || undefined, config);

    if (!rateCheck.allowed) {
      const headers = getRateLimitHeaders(hmacKey, config);
      return new Response(
        JSON.stringify({
          success: false,
          error: rateCheck.error || "Rate limit exceeded",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        }
      );
    }

    // Call the handler
    const response = await handler(req);

    // Add rate limit headers to successful responses
    const rateLimitHeaders = getRateLimitHeaders(hmacKey, config);
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  };
}

/**
 * Clean up old rate limit data (call periodically)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const [keyId, data] of rateLimitStore.entries()) {
    if (now - data.lastReset > maxAge) {
      rateLimitStore.delete(keyId);
    }
  }
}

// Set up periodic cleanup
setInterval(cleanupRateLimitStore, 60 * 60 * 1000); // Every hour