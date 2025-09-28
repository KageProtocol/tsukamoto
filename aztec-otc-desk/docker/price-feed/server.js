const express = require('express');
const redis = require('redis');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const client = require('prom-client');

const app = express();
const port = process.env.PORT || 3002;

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const priceUpdateCounter = new client.Counter({
  name: 'price_updates_total',
  help: 'Total number of price updates',
  labelNames: ['symbol']
});

const priceGauge = new client.Gauge({
  name: 'current_price',
  help: 'Current price of assets',
  labelNames: ['symbol']
});

register.registerMetric(priceUpdateCounter);
register.registerMetric(priceGauge);

// Redis client
let redisClient;
if (process.env.REDIS_URL) {
  redisClient = redis.createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (err) => console.log('Redis Client Error', err));
  redisClient.connect();
}

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());

// Mock price data with realistic volatility
const basePrices = {
  ETH: 2400,  // ETH in USD
  USDC: 1.0,  // USDC in USD
  BTC: 43000, // BTC in USD
  USDT: 1.0   // USDT in USD
};

// Generate realistic price with volatility
function generatePrice(basePrice, volatility = 0.02) {
  const randomFactor = 1 + (Math.random() - 0.5) * 2 * volatility;
  return Math.round(basePrice * randomFactor * 100) / 100;
}

// Current prices (updated periodically)
let currentPrices = { ...basePrices };

// Update prices every 5 seconds with realistic volatility
setInterval(() => {
  Object.keys(basePrices).forEach(symbol => {
    const newPrice = generatePrice(basePrices[symbol]);
    currentPrices[symbol] = newPrice;

    // Update metrics
    priceUpdateCounter.inc({ symbol });
    priceGauge.set({ symbol }, newPrice);

    // Cache in Redis if available
    if (redisClient) {
      redisClient.setEx(`price:${symbol}`, 60, newPrice.toString());
    }
  });

  console.log(`[${new Date().toISOString()}] Updated prices:`, currentPrices);
}, 5000);

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Get all current prices
app.get('/prices', async (req, res) => {
  try {
    let prices = currentPrices;

    // Try to get from Redis cache first
    if (redisClient) {
      const cachedPrices = {};
      for (const symbol of Object.keys(basePrices)) {
        const cached = await redisClient.get(`price:${symbol}`);
        if (cached) {
          cachedPrices[symbol] = parseFloat(cached);
        }
      }

      if (Object.keys(cachedPrices).length > 0) {
        prices = { ...currentPrices, ...cachedPrices };
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      prices,
      source: 'mock-feed'
    });
  } catch (error) {
    console.error('Error getting prices:', error);
    res.status(500).json({ error: 'Failed to get prices' });
  }
});

// Get specific price
app.get('/price/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    let price = currentPrices[symbol];

    // Try Redis cache first
    if (redisClient) {
      const cached = await redisClient.get(`price:${symbol}`);
      if (cached) {
        price = parseFloat(cached);
      }
    }

    if (price === undefined) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    res.json({
      symbol,
      price,
      timestamp: new Date().toISOString(),
      source: 'mock-feed'
    });
  } catch (error) {
    console.error('Error getting price:', error);
    res.status(500).json({ error: 'Failed to get price' });
  }
});

// Get historical data (mock)
app.get('/history/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const basePrice = basePrices[symbol];

  if (!basePrice) {
    return res.status(404).json({ error: 'Symbol not found' });
  }

  // Generate 24 hours of mock historical data
  const history = [];
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (let i = 23; i >= 0; i--) {
    const timestamp = new Date(now - (i * oneHour));
    const price = generatePrice(basePrice, 0.05); // Higher volatility for history

    history.push({
      timestamp: timestamp.toISOString(),
      price,
      volume: Math.floor(Math.random() * 1000000) // Mock volume
    });
  }

  res.json({
    symbol,
    history,
    source: 'mock-feed'
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(port, () => {
  console.log(`Price feed service running on port ${port}`);
  console.log(`Available endpoints:`);
  console.log(`  GET /health - Service health check`);
  console.log(`  GET /metrics - Prometheus metrics`);
  console.log(`  GET /prices - All current prices`);
  console.log(`  GET /price/:symbol - Specific price`);
  console.log(`  GET /history/:symbol - Historical data`);

  // Initialize prices immediately
  Object.keys(basePrices).forEach(symbol => {
    const price = generatePrice(basePrices[symbol]);
    currentPrices[symbol] = price;
    priceGauge.set({ symbol }, price);
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});