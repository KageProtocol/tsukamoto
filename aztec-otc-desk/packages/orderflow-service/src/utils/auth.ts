import crypto from "crypto";
import { checkRateLimit, getRateLimitHeaders, type RateLimitConfig } from "./rateLimiter";

const HEADER_SIGNATURE = "x-signature";
const HEADER_TIMESTAMP = "x-timestamp";

function getEnv(key: string, fallback?: string): string | undefined {
  const v = process.env[key];
  return v ?? fallback;
}

export function verifyHmac(params: {
  method: string;
  path: string;
  timestamp: string;
  body: string;
  signature: string;
}): boolean {
  const secret = getEnv("API_HMAC_SECRET");
  if (!secret) return false;

  const maxSkewSec = Number(getEnv("API_HMAC_MAX_SKEW_SECONDS", "300"));
  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > maxSkewSec) return false;

  const payload = [
    params.method.toUpperCase(),
    params.path,
    params.timestamp,
    params.body,
  ].join("\n");
  const computed = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const a = Buffer.from(computed);
  const b = Buffer.from(params.signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function requireHmacAuth(
  req: Request,
  bodyText: string,
  rateLimitConfig?: Partial<RateLimitConfig>
): Response | null {
  const url = new URL(req.url);
  const sig = req.headers.get(HEADER_SIGNATURE) || "";
  const ts = req.headers.get(HEADER_TIMESTAMP) || "";
  const nonce = req.headers.get("x-nonce") || undefined;

  if (!sig || !ts) {
    return new Response("Missing auth headers", { status: 401 });
  }

  // Check rate limit first
  const rateCheck = checkRateLimit(sig, ts, nonce, rateLimitConfig);
  if (!rateCheck.allowed) {
    const headers = getRateLimitHeaders(sig, rateLimitConfig);
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

  // Verify HMAC signature
  const ok = verifyHmac({
    method: req.method,
    path: url.pathname,
    timestamp: ts,
    body: bodyText,
    signature: sig,
  });

  if (!ok) {
    return new Response("Invalid signature", { status: 401 });
  }

  return null;
}

export function addRateLimitHeaders(
  response: Response,
  hmacKey: string,
  config?: Partial<RateLimitConfig>
): Response {
  const headers = getRateLimitHeaders(hmacKey, config);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
