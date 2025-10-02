import { serve } from "bun";
import { register, Counter, Histogram, Gauge } from "prom-client";

const PORT = process.env.PORT || 3001;

// Prometheus metrics
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const ordersTotal = new Gauge({
  name: 'orders_total',
  help: 'Total number of orders in the system'
});

const serviceInfo = new Gauge({
  name: 'service_info',
  help: 'Service information',
  labelNames: ['version', 'service']
});

// Set service info
serviceInfo.set({ version: '1.0.0', service: 'orderflow' }, 1);

console.log(`🚀 OTC Orderflow Service starting on port ${PORT}`);

const server = serve({
  port: PORT,
  async fetch(req) {
    const startTime = Date.now();
    const url = new URL(req.url);
    const method = req.method;
    let status = 200;
    let route = url.pathname;

    try {
      // Health check endpoint
      if (url.pathname === "/health") {
        route = "/health";
        const response = new Response(JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          service: "orderflow"
        }), {
          headers: { "Content-Type": "application/json" }
        });

        // Record metrics
        httpRequestsTotal.inc({ method, route, status_code: status });
        httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

        return response;
      }

      // Orders endpoint (GET - list orders)
      if (url.pathname === "/orders" && method === "GET") {
        route = "/orders";
        ordersTotal.set(0); // Update with actual count when implemented

        const response = new Response(JSON.stringify({
          success: true,
          message: "Retrieved 0 order(s)",
          data: []
        }), {
          headers: { "Content-Type": "application/json" }
        });

        // Record metrics
        httpRequestsTotal.inc({ method, route, status_code: status });
        httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

        return response;
      }

      // Order endpoint (POST - create order)
      if (url.pathname === "/order" && method === "POST") {
        route = "/order";

        try {
          const body = await req.text();
          const orderData = JSON.parse(body);

          // TODO: Validate HMAC signature here
          // TODO: Store order in database

          console.log("Order creation request received:", {
            escrowAddress: orderData.escrowAddress,
            sellTokenAddress: orderData.sellTokenAddress,
            buyTokenAddress: orderData.buyTokenAddress,
            sellTokenAmount: orderData.sellTokenAmount,
            buyTokenAmount: orderData.buyTokenAmount
          });

          const response = new Response(JSON.stringify({
            success: true,
            message: "Order created successfully",
            orderId: `order_${Date.now()}`
          }), {
            headers: { "Content-Type": "application/json" }
          });

          // Record metrics
          httpRequestsTotal.inc({ method, route, status_code: status });
          httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

          return response;
        } catch (error) {
          status = 400;
          const response = new Response(JSON.stringify({
            success: false,
            message: "Invalid order data",
            error: error.message
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });

          // Record metrics
          httpRequestsTotal.inc({ method, route, status_code: status });
          httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

          return response;
        }
      }

      // Metrics endpoint
      if (url.pathname === "/metrics") {
        route = "/metrics";
        const metrics = await register.metrics();

        const response = new Response(metrics, {
          headers: { "Content-Type": register.contentType }
        });

        // Record metrics (but don't include metrics endpoint in its own metrics)
        return response;
      }

      // 404 Not Found
      status = 404;
      route = "unknown";
      const response = new Response("Not Found", { status: 404 });

      // Record metrics
      httpRequestsTotal.inc({ method, route, status_code: status });
      httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

      return response;

    } catch (error) {
      status = 500;
      const response = new Response("Internal Server Error", { status: 500 });

      // Record metrics
      httpRequestsTotal.inc({ method, route, status_code: status });
      httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

      return response;
    }
  },
});

console.log(`✅ OTC Orderflow Service running on http://localhost:${PORT}`);
console.log(`📋 Available endpoints:`);
console.log(`   GET /health - Health check`);
console.log(`   GET /orders - List orders`);
console.log(`   GET /metrics - Prometheus metrics`);