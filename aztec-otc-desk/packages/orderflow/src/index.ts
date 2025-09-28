import { serve } from "bun";

const PORT = process.env.PORT || 3001;

console.log(`🚀 OTC Orderflow Service starting on port ${PORT}`);

const server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "orderflow"
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Orders endpoint (placeholder)
    if (url.pathname === "/orders") {
      return new Response(JSON.stringify({
        success: true,
        message: "Retrieved 0 order(s)",
        data: []
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Metrics endpoint (placeholder)
    if (url.pathname === "/metrics") {
      return new Response("# No metrics configured yet\n", {
        headers: { "Content-Type": "text/plain" }
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`✅ OTC Orderflow Service running on http://localhost:${PORT}`);
console.log(`📋 Available endpoints:`);
console.log(`   GET /health - Health check`);
console.log(`   GET /orders - List orders`);
console.log(`   GET /metrics - Prometheus metrics`);