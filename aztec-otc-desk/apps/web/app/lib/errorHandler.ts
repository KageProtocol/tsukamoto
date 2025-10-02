/**
 * Centralized error handling utilities
 * Prevents error toast spam and provides consistent error handling across the app
 */

import { toast } from "../components/ToastStack";

// Track recent errors to prevent duplicates
const recentErrors = new Map<string, number>();
const ERROR_DEBOUNCE_MS = 2000; // Don't show same error within 2 seconds

/**
 * Check if an error message was recently shown
 */
function isDuplicateError(message: string): boolean {
  const now = Date.now();
  const lastShown = recentErrors.get(message);

  if (lastShown && now - lastShown < ERROR_DEBOUNCE_MS) {
    return true;
  }

  recentErrors.set(message, now);

  // Cleanup old entries
  if (recentErrors.size > 50) {
    const cutoff = now - ERROR_DEBOUNCE_MS;
    for (const [msg, time] of recentErrors.entries()) {
      if (time < cutoff) {
        recentErrors.delete(msg);
      }
    }
  }

  return false;
}

/**
 * Extract user-friendly error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return "An unknown error occurred";

  if (typeof error === "string") return error;

  if (error instanceof Error) {
    return error.message || "An error occurred";
  }

  if (typeof error === "object" && error !== null) {
    // Handle API error responses
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    if ("error" in error && typeof error.error === "string") {
      return error.error;
    }
  }

  return "An unexpected error occurred";
}

/**
 * Safe error handler wrapper for async functions
 * Prevents unhandled promise rejections and shows user-friendly errors
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: {
    errorMessage?: string;
    successMessage?: string;
    showToast?: boolean;
    onError?: (error: Error) => void;
    onSuccess?: (result: any) => void;
  }
): T {
  const {
    errorMessage = "Operation failed",
    successMessage,
    showToast = true,
    onError,
    onSuccess
  } = options || {};

  return (async (...args: any[]) => {
    try {
      const result = await fn(...args);

      if (successMessage && showToast) {
        toast.success(successMessage);
      }

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (error) {
      const message = extractErrorMessage(error);
      const fullMessage = errorMessage ? `${errorMessage}: ${message}` : message;

      // Only show toast if not duplicate and showToast is true
      if (showToast && !isDuplicateError(fullMessage)) {
        toast.error(fullMessage);
      }

      if (onError) {
        onError(error as Error);
      }

      // Log to console for debugging
      console.error(`[Error Handler] ${fullMessage}`, error);

      // Re-throw to allow caller to handle if needed
      throw error;
    }
  }) as T;
}

/**
 * Handle API responses with standard error checking
 */
export async function handleApiResponse<T = any>(
  response: Response,
  options?: {
    errorPrefix?: string;
  }
): Promise<T> {
  const { errorPrefix = "API Error" } = options || {};

  if (!response.ok) {
    let errorMessage = `${errorPrefix}: ${response.status} ${response.statusText}`;

    try {
      const json = await response.json();
      if (json.error || json.message) {
        errorMessage = json.error || json.message;
      }
    } catch {
      // Response not JSON, use status text
    }

    throw new Error(errorMessage);
  }

  const json = await response.json();

  if (json.success === false) {
    throw new Error(json.error || json.message || "Operation failed");
  }

  return json;
}

/**
 * Throttle toast messages during streaming operations
 * Only shows important messages (errors, success) and throttles info messages
 */
export class StreamToastThrottler {
  private lastInfoToast = 0;
  private readonly INFO_THROTTLE_MS = 5000; // Only show info toast every 5 seconds
  private messageCount = 0;

  /**
   * Show a toast message with intelligent throttling
   */
  showMessage(message: string, type: "info" | "error" | "success" = "info") {
    this.messageCount++;

    // Always show errors and success immediately
    if (type === "error") {
      if (!isDuplicateError(message)) {
        toast.error(message);
      }
      return;
    }

    if (type === "success") {
      toast.success(message);
      return;
    }

    // Throttle info messages
    const now = Date.now();
    if (now - this.lastInfoToast >= this.INFO_THROTTLE_MS) {
      toast.info(message);
      this.lastInfoToast = now;
    }
  }

  /**
   * Get statistics about messages processed
   */
  getStats() {
    return {
      messageCount: this.messageCount
    };
  }

  /**
   * Reset the throttler
   */
  reset() {
    this.lastInfoToast = 0;
    this.messageCount = 0;
  }
}
