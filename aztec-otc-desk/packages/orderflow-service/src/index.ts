
import { createOrderHandlers } from "./handlers";
import { SQLiteDatabase, PostgresDatabase } from "./db";

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
  
  const server = Bun.serve({
    port: 3000,
    fetch(req) {
      const url = new URL(req.url);
      
      // POST /order endpoint

      if (url.pathname === "/order") {
        switch (req.method) {
          case "POST":
            return handleCreateOrder(req);
          case "GET":
            return handleGetOrder(req);
          case "DELETE":
            return handleCloseOrder(req);
          default:
            return new Response("Method Not Allowed", { status: 405 });
        }
      }
      if (req.method === "POST" && url.pathname === "/order") {
        return handleCreateOrder(req);
      }
      
      // GET /order endpoint
      if (req.method === "GET" && url.pathname === "/order") {
        return handleGetOrder(req);
      }

      // healthcheck endpoint
      if (req.method === "GET" && url.pathname === "/health") {
        return new Response("OK", { status: 200 });
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