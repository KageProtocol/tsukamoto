// Simple in-memory metrics store
const metrics = {
  // Counters
  totalRequests: 0,
  totalOrders: 0,
  totalOrdersCancelled: 0,
  totalErrors: 0,

  // Rate limiting metrics
  rateLimitHits: 0,
  authFailures: 0,

  // Latency tracking (sliding window)
  latencies: [] as number[],

  // Start time
  startTime: Date.now(),
};

const MAX_LATENCY_SAMPLES = 1000;

export interface MetricsData {
  uptime: number;
  totalRequests: number;
  totalOrders: number;
  totalOrdersCancelled: number;
  totalErrors: number;
  rateLimitHits: number;
  authFailures: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  requestsPerMinute: number;
  healthStatus: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
}

export function incrementCounter(key: keyof typeof metrics) {
  if (typeof metrics[key] === "number") {
    (metrics[key] as number)++;
  }
}

export function recordLatency(latencyMs: number) {
  metrics.latencies.push(latencyMs);

  // Keep only the last N samples
  if (metrics.latencies.length > MAX_LATENCY_SAMPLES) {
    metrics.latencies = metrics.latencies.slice(-MAX_LATENCY_SAMPLES);
  }
}

export function getMetrics(): MetricsData {
  const now = Date.now();
  const uptime = now - metrics.startTime;
  const uptimeMinutes = uptime / (1000 * 60);

  // Calculate latency percentiles
  const sortedLatencies = [...metrics.latencies].sort((a, b) => a - b);
  const averageLatency = sortedLatencies.length > 0
    ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
    : 0;

  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p99Index = Math.floor(sortedLatencies.length * 0.99);

  const p95Latency = sortedLatencies[p95Index] || 0;
  const p99Latency = sortedLatencies[p99Index] || 0;

  // Calculate requests per minute
  const requestsPerMinute = uptimeMinutes > 0 ? metrics.totalRequests / uptimeMinutes : 0;

  // Determine health status
  let healthStatus: MetricsData["healthStatus"] = "healthy";

  if (p95Latency > 5000) { // 5 seconds
    healthStatus = "unhealthy";
  } else if (p95Latency > 2000 || metrics.totalErrors / Math.max(metrics.totalRequests, 1) > 0.1) {
    healthStatus = "degraded";
  }

  return {
    uptime,
    totalRequests: metrics.totalRequests,
    totalOrders: metrics.totalOrders,
    totalOrdersCancelled: metrics.totalOrdersCancelled,
    totalErrors: metrics.totalErrors,
    rateLimitHits: metrics.rateLimitHits,
    authFailures: metrics.authFailures,
    averageLatency: Math.round(averageLatency * 100) / 100,
    p95Latency: Math.round(p95Latency * 100) / 100,
    p99Latency: Math.round(p99Latency * 100) / 100,
    requestsPerMinute: Math.round(requestsPerMinute * 100) / 100,
    healthStatus,
    timestamp: now,
  };
}

export function getPrometheusMetrics(): string {
  const metricsData = getMetrics();

  return `# HELP orderflow_requests_total Total number of requests
# TYPE orderflow_requests_total counter
orderflow_requests_total ${metricsData.totalRequests}

# HELP orderflow_orders_total Total number of orders created
# TYPE orderflow_orders_total counter
orderflow_orders_total ${metricsData.totalOrders}

# HELP orderflow_orders_cancelled_total Total number of orders cancelled
# TYPE orderflow_orders_cancelled_total counter
orderflow_orders_cancelled_total ${metricsData.totalOrdersCancelled}

# HELP orderflow_errors_total Total number of errors
# TYPE orderflow_errors_total counter
orderflow_errors_total ${metricsData.totalErrors}

# HELP orderflow_rate_limit_hits_total Total number of rate limit hits
# TYPE orderflow_rate_limit_hits_total counter
orderflow_rate_limit_hits_total ${metricsData.rateLimitHits}

# HELP orderflow_auth_failures_total Total number of auth failures
# TYPE orderflow_auth_failures_total counter
orderflow_auth_failures_total ${metricsData.authFailures}

# HELP orderflow_latency_ms Request latency in milliseconds
# TYPE orderflow_latency_ms gauge
orderflow_latency_ms{quantile="0.50"} ${metricsData.averageLatency}
orderflow_latency_ms{quantile="0.95"} ${metricsData.p95Latency}
orderflow_latency_ms{quantile="0.99"} ${metricsData.p99Latency}

# HELP orderflow_requests_per_minute Requests per minute
# TYPE orderflow_requests_per_minute gauge
orderflow_requests_per_minute ${metricsData.requestsPerMinute}

# HELP orderflow_uptime_seconds Service uptime in seconds
# TYPE orderflow_uptime_seconds gauge
orderflow_uptime_seconds ${Math.floor(metricsData.uptime / 1000)}

# HELP orderflow_health_status Service health status (0=unhealthy, 1=degraded, 2=healthy)
# TYPE orderflow_health_status gauge
orderflow_health_status ${metricsData.healthStatus === "healthy" ? 2 : metricsData.healthStatus === "degraded" ? 1 : 0}
`;
}

// Middleware to track request metrics
export function withMetrics<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  metricLabels?: { operation?: string }
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    incrementCounter("totalRequests");

    try {
      const response = await handler(...args);

      // Record latency
      const latency = Date.now() - startTime;
      recordLatency(latency);

      // Track specific operations
      if (metricLabels?.operation === "create_order" && response.status < 400) {
        incrementCounter("totalOrders");
      } else if (metricLabels?.operation === "cancel_order" && response.status < 400) {
        incrementCounter("totalOrdersCancelled");
      }

      // Track errors
      if (response.status >= 400) {
        incrementCounter("totalErrors");

        if (response.status === 429) {
          incrementCounter("rateLimitHits");
        } else if (response.status === 401 || response.status === 403) {
          incrementCounter("authFailures");
        }
      }

      return response;
    } catch (error) {
      incrementCounter("totalErrors");
      throw error;
    }
  }) as T;
}