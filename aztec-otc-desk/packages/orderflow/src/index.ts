import { serve } from "bun";
import { register, Counter, Histogram, Gauge } from "prom-client";
import db from "./db";
import { eventBroadcaster } from "./events";
import { initRedis, cache, pubsub, cacheKeys, CACHE_TTL, OrderEventPayload } from "./redis";
import { validateHmac } from "./hmac";

const PORT = process.env.PORT || 3001;

// Transform database order to API format (snake_case to camelCase)
function transformOrderForAPI(order: any, includeSensitive: boolean = false) {
  const transformed: any = {
    ...order,
    orderId: order.order_id,
    escrowAddress: order.escrow_address,
    contractInstance: order.contract_instance,
    sellTokenAddress: order.sell_token_address,
    sellTokenAmount: order.sell_token_amount,
    buyTokenAddress: order.buy_token_address,
    buyTokenAmount: order.buy_token_amount,
    orderNonce: order.order_nonce,
    domainSeparator: order.domain_separator,
    minFillAmount: order.min_fill_amount,
    maxSlippageBps: order.max_slippage_bps,
    expiryTimestamp: order.expiry_timestamp,
    createdBy: order.created_by,
    workspaceId: order.workspace_id,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    closedAt: order.closed_at
  };

  // Only include sensitive fields if explicitly requested
  if (includeSensitive) {
    transformed.secretKey = order.secret_key;
    transformed.partialAddress = order.partial_address;
  } else {
    // Remove sensitive fields from response
    delete transformed.secret_key;
    delete transformed.partial_address;
  }

  return transformed;
}

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

// Initialize Redis
initRedis().then(() => {
  // Subscribe to Redis pub/sub and forward to SSE clients
  pubsub.subscribe((event: OrderEventPayload) => {
    console.log(`[Redis->SSE] Forwarding ${event.type} event to SSE clients`);
    // Forward to eventBroadcaster
    switch (event.type) {
      case 'order_created':
        eventBroadcaster.orderCreated(event.orderId, event.data);
        break;
      case 'order_filled':
        eventBroadcaster.orderFilled(event.orderId, event.data);
        break;
      case 'order_cancelled':
        eventBroadcaster.orderCancelled(event.orderId, event.data);
        break;
      case 'order_updated':
        eventBroadcaster.orderUpdated(event.orderId, event.data);
        break;
    }
  });
});

const server = serve({
  port: PORT,
  async fetch(req) {
    const startTime = Date.now();
    const url = new URL(req.url);
    const method = req.method;
    let status = 200;
    let route = url.pathname;

    try {
      // Server-Sent Events endpoint for real-time order updates
      if (url.pathname === "/events" && method === "GET") {
        route = "/events";

        const stream = new ReadableStream({
          start(controller) {
            // Add client to broadcaster
            eventBroadcaster.addClient(controller);

            // Set up cleanup on client disconnect
            req.signal.addEventListener('abort', () => {
              eventBroadcaster.removeClient(controller);
              try {
                controller.close();
              } catch (e) {
                // Ignore errors when closing
              }
            });
          },
          cancel() {
            // Client disconnected
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }

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

      // Order endpoint (GET - get single order by ID)
      if (url.pathname === "/order" && method === "GET") {
        route = "/order";

        try {
          const orderId = url.searchParams.get('id');
          if (!orderId) {
            status = 400;
            return new Response(JSON.stringify({
              success: false,
              message: "Order ID is required"
            }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Validate HMAC signature before allowing sensitive data
          const includeSensitive = url.searchParams.get('include_sensitive') === 'true';

          if (includeSensitive) {
            const validation = validateHmac(req, 'GET', '/order', '');

            if (!validation.valid) {
              status = 401;
              return new Response(JSON.stringify({
                success: false,
                message: "Unauthorized: " + (validation.error || "Invalid HMAC signature")
              }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
              });
            }
          }

          // Get order from database
          const order = await db.getOrderById(orderId);

          if (!order) {
            status = 404;
            return new Response(JSON.stringify({
              success: false,
              message: "Order not found"
            }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Transform order to API format
          const transformedOrder = transformOrderForAPI(order, includeSensitive);

          const response = new Response(JSON.stringify({
            success: true,
            message: "Order retrieved successfully",
            data: [transformedOrder]
          }), {
            headers: { "Content-Type": "application/json" }
          });

          // Record metrics
          httpRequestsTotal.inc({ method, route, status_code: status });
          httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

          return response;
        } catch (error) {
          console.error("Database error:", error);
          status = 500;
          const response = new Response(JSON.stringify({
            success: false,
            message: "Database error",
            error: error.message
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });

          // Record metrics
          httpRequestsTotal.inc({ method, route, status_code: status });
          httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

          return response;
        }
      }

      // Orders endpoint (GET - list orders)
      if (url.pathname === "/orders" && method === "GET") {
        route = "/orders";

        try {
          // Parse query parameters
          const searchParams = url.searchParams;
          const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
          const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;
          const orderStatus = searchParams.get('status') || undefined;
          const sellToken = searchParams.get('sellToken') || undefined;
          const buyToken = searchParams.get('buyToken') || undefined;

          // Validate HMAC signature before allowing sensitive data
          const includeSensitive = searchParams.get('include_sensitive') === 'true';

          if (includeSensitive) {
            const validation = validateHmac(req, 'GET', '/orders', '');

            if (!validation.valid) {
              status = 401;
              return new Response(JSON.stringify({
                success: false,
                message: "Unauthorized: " + (validation.error || "Invalid HMAC signature")
              }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
              });
            }
          }

          // Try Redis cache first (only for non-sensitive requests with no pagination)
          const cacheKey = cacheKeys.ordersList({ status: orderStatus, sellToken, buyToken });
          let orders, totalCount;

          if (!includeSensitive && offset === 0) {
            const cached = await cache.get(cacheKey);
            if (cached) {
              const cachedData = JSON.parse(cached);
              orders = cachedData.orders;
              totalCount = cachedData.totalCount;
              console.log(`[Cache HIT] ${cacheKey}`);
            }
          }

          // Cache miss - fetch from database
          if (!orders) {
            orders = await db.getOrders({
              status: orderStatus,
              limit,
              offset,
              sellToken,
              buyToken
            });

            totalCount = await db.getOrderCount(orderStatus);

            // Cache the result (only for first page)
            if (offset === 0 && !includeSensitive) {
              await cache.set(
                cacheKey,
                JSON.stringify({ orders, totalCount }),
                CACHE_TTL.ORDERS_LIST
              );
            }
          }

          // Update metrics
          ordersTotal.set(totalCount);

          // Transform orders to API format
          const transformedOrders = orders.map(order => transformOrderForAPI(order, includeSensitive));

          const response = new Response(JSON.stringify({
            success: true,
            message: `Retrieved ${orders.length} order(s)`,
            data: transformedOrders,
            pagination: {
              total: totalCount,
              limit,
              offset,
              hasMore: offset + orders.length < totalCount
            }
          }), {
            headers: { "Content-Type": "application/json" }
          });

          // Record metrics
          httpRequestsTotal.inc({ method, route, status_code: status });
          httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

          return response;
        } catch (error) {
          console.error("Database error:", error);
          status = 500;
          const response = new Response(JSON.stringify({
            success: false,
            message: "Database error",
            error: error.message
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });

          // Record metrics
          httpRequestsTotal.inc({ method, route, status_code: status });
          httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

          return response;
        }
      }

      // Order endpoint (POST - create order)
      if (url.pathname === "/order" && method === "POST") {
        route = "/order";

        try {
          const body = await req.text();
          const orderData = JSON.parse(body);

          // Validate HMAC signature for order creation
          const validation = validateHmac(req, 'POST', '/order', body);

          if (!validation.valid) {
            status = 401;
            return new Response(JSON.stringify({
              success: false,
              message: "Unauthorized: " + (validation.error || "Invalid HMAC signature")
            }), {
              status: 401,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Create order in database
          const order = await db.createOrder({
            order_id: orderData.orderId || `${Date.now()}_${Math.floor(Math.random() * 1000000)}`,
            escrow_address: orderData.escrowAddress,
            contract_instance: orderData.contractInstance || JSON.stringify({}),
            secret_key: orderData.secretKey,
            partial_address: orderData.partialAddress,
            sell_token_address: orderData.sellTokenAddress,
            sell_token_amount: orderData.sellTokenAmount,
            buy_token_address: orderData.buyTokenAddress,
            buy_token_amount: orderData.buyTokenAmount,
            order_nonce: orderData.orderNonce,
            domain_separator: orderData.domainSeparator,
            min_fill_amount: orderData.minFillAmount,
            max_slippage_bps: orderData.maxSlippageBps,
            expiry_timestamp: orderData.expiryTimestamp,
            status: 'open',
            created_by: orderData.createdBy || (orderData.accountIndex !== undefined ? `cli_account_${orderData.accountIndex}` : 'cli'),
            workspace_id: orderData.workspaceId
          });

          console.log("✅ Order created in database:", {
            orderId: order.order_id,
            escrowAddress: order.escrow_address,
            sellToken: order.sell_token_address,
            buyToken: order.buy_token_address
          });

          // Invalidate cache
          await cache.invalidatePattern('orders:*');

          const transformedOrder = transformOrderForAPI(order);

          // Publish to Redis pub/sub
          await pubsub.publish({
            type: 'order_created',
            orderId: order.order_id,
            data: transformedOrder,
            timestamp: new Date().toISOString()
          });

          // Broadcast order created event to SSE clients
          eventBroadcaster.orderCreated(order.order_id, transformedOrder);

          const response = new Response(JSON.stringify({
            success: true,
            message: "Order created successfully",
            orderId: order.order_id,
            data: order
          }), {
            headers: { "Content-Type": "application/json" }
          });

          // Record metrics
          httpRequestsTotal.inc({ method, route, status_code: status });
          httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

          return response;
        } catch (error) {
          console.error("Order creation error:", error);
          status = 400;
          const response = new Response(JSON.stringify({
            success: false,
            message: "Invalid order data or database error",
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

      // Order endpoint (DELETE - close/cancel order)
      if (url.pathname === "/order" && method === "DELETE") {
        route = "/order";

        try {
          const orderId = url.searchParams.get('id');
          if (!orderId) {
            status = 400;
            return new Response(JSON.stringify({
              success: false,
              message: "Order ID is required"
            }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Validate HMAC signature for order deletion
          const validation = validateHmac(req, 'DELETE', '/order', '');

          if (!validation.valid) {
            status = 401;
            return new Response(JSON.stringify({
              success: false,
              message: "Unauthorized: " + (validation.error || "Invalid HMAC signature")
            }), {
              status: 401,
              headers: { "Content-Type": "application/json" }
            });
          }

          // Update order status to filled
          const updatedOrder = await db.updateOrderStatus(orderId, 'filled', 'cli');

          if (!updatedOrder) {
            status = 404;
            return new Response(JSON.stringify({
              success: false,
              message: "Order not found"
            }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          console.log("✅ Order closed:", {
            orderId: updatedOrder.order_id,
            status: updatedOrder.status
          });

          // Invalidate cache
          await cache.invalidatePattern('orders:*');

          const transformedOrder = transformOrderForAPI(updatedOrder);

          // Publish to Redis pub/sub
          await pubsub.publish({
            type: 'order_filled',
            orderId: updatedOrder.order_id,
            data: transformedOrder,
            timestamp: new Date().toISOString()
          });

          // Broadcast order filled event to SSE clients
          eventBroadcaster.orderFilled(updatedOrder.order_id, transformedOrder);

          const response = new Response(JSON.stringify({
            success: true,
            message: "Order closed successfully",
            data: transformOrderForAPI(updatedOrder)
          }), {
            headers: { "Content-Type": "application/json" }
          });

          // Record metrics
          httpRequestsTotal.inc({ method, route, status_code: status });
          httpRequestDuration.observe({ method, route }, (Date.now() - startTime) / 1000);

          return response;
        } catch (error) {
          console.error("Order close error:", error);
          status = 500;
          const response = new Response(JSON.stringify({
            success: false,
            message: "Error closing order",
            error: error.message
          }), {
            status: 500,
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
console.log(`   GET /events - Server-Sent Events (SSE) for real-time updates`);
console.log(`   GET /orders - List orders`);
console.log(`   GET /order?id=<id> - Get single order`);
console.log(`   POST /order - Create order`);
console.log(`   DELETE /order?id=<id> - Close/cancel order`);
console.log(`   GET /metrics - Prometheus metrics`);