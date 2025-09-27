
import { createOrderHandlers } from "./handlers";
import { SQLiteDatabase, PostgresDatabase } from "./db";
import { getMetrics, getPrometheusMetrics, withMetrics } from "./utils/metrics";

/**
 * Orderflow Service
 * 
 * A Bun-based HTTP server for handling order operations in the Aztec OTC Desk.
 */

const main = async () => {
  // Create and initialize database
  const usePg = Boolean(process.env.DATABASE_URL);
  const database: any = usePg
    ? new PostgresDatabase(process.env.DATABASE_URL)
    : new SQLiteDatabase();
  await (database.initialize?.() ?? database.initialize());
  
  // Create handlers with database dependency injection
  const {
    handleCreateOrder,
    handleGetOrder,
    handleCloseOrder
  } = createOrderHandlers(database);

  // Wrap handlers with metrics tracking
  const metricsWrappedHandlers = {
    handleCreateOrder: withMetrics(handleCreateOrder, { operation: "create_order" }),
    handleGetOrder: withMetrics(handleGetOrder, { operation: "get_order" }),
    handleCloseOrder: withMetrics(handleCloseOrder, { operation: "cancel_order" }),
  };
  
  const server = Bun.serve({
    port: 3000,
    fetch(req) {
      const url = new URL(req.url);
      
      // POST /order endpoint

      if (url.pathname === "/order") {
        switch (req.method) {
          case "POST":
            return metricsWrappedHandlers.handleCreateOrder(req);
          case "GET":
            return metricsWrappedHandlers.handleGetOrder(req);
          case "DELETE":
            return metricsWrappedHandlers.handleCloseOrder(req);
          default:
            return new Response("Method Not Allowed", { status: 405 });
        }
      }

      // Health endpoints
      if (req.method === "GET" && url.pathname === "/health") {
        const metrics = getMetrics();
        return new Response(JSON.stringify({
          status: "ok",
          health: metrics.healthStatus,
          uptime: metrics.uptime,
          timestamp: metrics.timestamp
        }), {
          status: metrics.healthStatus === "healthy" ? 200 : 503,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (req.method === "GET" && url.pathname === "/healthz") {
        return new Response("OK", { status: 200 });
      }

      if (req.method === "GET" && url.pathname === "/readyz") {
        try {
          // Check database connectivity
          const testQuery = database.getAllOrders;
          if (typeof testQuery === "function") {
            testQuery.call(database);
          }
          return new Response("Ready", { status: 200 });
        } catch (error) {
          return new Response("Not Ready", { status: 503 });
        }
      }

      // Metrics endpoints
      if (req.method === "GET" && url.pathname === "/metrics") {
        const metrics = getMetrics();
        return new Response(JSON.stringify(metrics), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (req.method === "GET" && url.pathname === "/metrics/prometheus") {
        const prometheusMetrics = getPrometheusMetrics();
        return new Response(prometheusMetrics, {
          status: 200,
          headers: { "Content-Type": "text/plain" }
        });
      }

      // Handle 404
      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`🚀 Orderflow Service running on http://localhost:${server.port}`);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    database.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    database.close();
    process.exit(0);
  });
};

main();