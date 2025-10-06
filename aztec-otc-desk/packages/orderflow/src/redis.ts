import { createClient } from 'redis';

// Redis client configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6381';

// Create Redis clients (one for caching, one for pub/sub)
const cacheClient = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[Redis] Max reconnection attempts reached');
        return new Error('Redis max reconnection attempts exceeded');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

const pubClient = createClient({ url: REDIS_URL });
const subClient = createClient({ url: REDIS_URL });

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  ORDERS_LIST: 10, // 10 seconds for order list
  ORDER_DETAIL: 30, // 30 seconds for individual orders
  ORDER_COUNT: 15, // 15 seconds for counts
};

// Cache keys
export const cacheKeys = {
  ordersList: (filters?: {status?: string; sellToken?: string; buyToken?: string}) => {
    const parts = ['orders', 'list'];
    if (filters?.status) parts.push(`status:${filters.status}`);
    if (filters?.sellToken) parts.push(`sell:${filters.sellToken}`);
    if (filters?.buyToken) parts.push(`buy:${filters.buyToken}`);
    return parts.join(':');
  },
  orderDetail: (orderId: string) => `orders:detail:${orderId}`,
  orderCount: (status?: string) => `orders:count${status ? `:${status}` : ''}`,
};

// Initialize Redis connections
let isConnected = false;

export async function initRedis() {
  try {
    console.log('[Redis] Connecting to Redis...');

    await Promise.all([
      cacheClient.connect(),
      pubClient.connect(),
      subClient.connect()
    ]);

    isConnected = true;
    console.log('✅ Redis connected successfully');

    // Set up error handlers
    cacheClient.on('error', (err) => console.error('[Redis Cache] Error:', err));
    pubClient.on('error', (err) => console.error('[Redis Pub] Error:', err));
    subClient.on('error', (err) => console.error('[Redis Sub] Error:', err));

  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    console.log('[Redis] Continuing without cache - falling back to database only');
    isConnected = false;
  }
}

// Cache operations with fallback
export const cache = {
  async get(key: string): Promise<string | null> {
    if (!isConnected) return null;
    try {
      return await cacheClient.get(key);
    } catch (error) {
      console.error(`[Redis] Get error for key ${key}:`, error);
      return null;
    }
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!isConnected) return;
    try {
      if (ttlSeconds) {
        await cacheClient.setEx(key, ttlSeconds, value);
      } else {
        await cacheClient.set(key, value);
      }
    } catch (error) {
      console.error(`[Redis] Set error for key ${key}:`, error);
    }
  },

  async del(key: string): Promise<void> {
    if (!isConnected) return;
    try {
      await cacheClient.del(key);
    } catch (error) {
      console.error(`[Redis] Delete error for key ${key}:`, error);
    }
  },

  async invalidatePattern(pattern: string): Promise<void> {
    if (!isConnected) return;
    try {
      const keys = await cacheClient.keys(pattern);
      if (keys.length > 0) {
        await cacheClient.del(keys);
        console.log(`[Redis] Invalidated ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.error(`[Redis] Pattern invalidation error for ${pattern}:`, error);
    }
  }
};

// Pub/Sub for order events
export const ORDER_EVENTS_CHANNEL = 'order:events';

export type OrderEventType = 'order_created' | 'order_updated' | 'order_filled' | 'order_cancelled';

export interface OrderEventPayload {
  type: OrderEventType;
  orderId: string;
  data?: any;
  timestamp: string;
}

export const pubsub = {
  async publish(event: OrderEventPayload): Promise<void> {
    if (!isConnected) return;
    try {
      await pubClient.publish(ORDER_EVENTS_CHANNEL, JSON.stringify(event));
      console.log(`[Redis Pub] Published ${event.type} for order ${event.orderId}`);
    } catch (error) {
      console.error('[Redis Pub] Publish error:', error);
    }
  },

  async subscribe(handler: (event: OrderEventPayload) => void): Promise<void> {
    if (!isConnected) {
      console.log('[Redis Sub] Skipping subscription - Redis not connected');
      return;
    }

    try {
      await subClient.subscribe(ORDER_EVENTS_CHANNEL, (message) => {
        try {
          const event = JSON.parse(message) as OrderEventPayload;
          handler(event);
        } catch (error) {
          console.error('[Redis Sub] Message parse error:', error);
        }
      });
      console.log(`[Redis Sub] Subscribed to ${ORDER_EVENTS_CHANNEL}`);
    } catch (error) {
      console.error('[Redis Sub] Subscribe error:', error);
    }
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Redis] Closing connections...');
  await Promise.all([
    cacheClient.quit(),
    pubClient.quit(),
    subClient.quit()
  ]);
  console.log('[Redis] Connections closed');
});

export { isConnected };
