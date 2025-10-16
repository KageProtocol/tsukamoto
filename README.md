# Tsukamoto Private OTC Desk

An Over-the-Counter trading desk built on the Aztec Network. Enables private, trustless token swaps. EXPERIMENTAL!

![Tsukamoto OTC Desk](./assets/preview.png)

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **Bun** runtime
- **Docker & Docker Compose**
- **Git**

### One-Command Setup

```bash
git clone <repository-url> tsukamoto
cd tsukamoto/aztec-otc-desk
./scripts/setup-dev.sh
```

This automatically installs dependencies, compiles contracts, starts infrastructure, and creates test data.

### Manual Setup

```bash
# 1. Clone and navigate
git clone <repository-url> tsukamoto
cd tsukamoto/aztec-otc-desk

# 2. Environment setup
cp .env.example .env
node scripts/validate-env.js

# 3. Start infrastructure
docker-compose up -d

# 4. Install dependencies
npm ci && bun install

# 5. Compile contracts
cd packages/contracts && bun run build

# 6. Start services (separate terminals)
cd packages/orderflow && bun run dev     # Terminal 1
cd apps/web && npm run dev               # Terminal 2
```

## 🌐 Application Access

| Service | URL | Purpose |
|---------|-----|---------|
| **Trading Interface** | http://localhost:5173 | Main OTC trading application |
| **API** | http://localhost:3001 | REST API and WebSocket endpoints |
| **Monitoring** | http://localhost:3000 | Grafana dashboards |
| **Metrics** | http://localhost:9090 | Prometheus metrics |
| **Price Feed** | http://localhost:3002 | Real-time price data |

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Frontend  │    │  Orderflow API   │    │ Smart Contracts │
│   (React/Next)  │────│  (Bun/TypeScript)│────│  (Noir/Aztec)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Monitoring    │    │    Database      │    │  Aztec Network  │
│ (Grafana/Prom)  │    │  (PostgreSQL)    │    │ (Sandbox/PXE)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Core Components

- **Smart Contracts**: Noir contracts with anti-reentrancy protection
- **Orderflow Service**: API with HMAC authentication and real-time updates
- **Trading Interface**: Real-time price feeds
- **Infrastructure**: Docker composition with monitoring and alerting

## 🔐 Security Features

### Smart Contract Security
- **Reentrancy Protection**: Nullifier-first pattern prevents double-spending
- **Access Controls**: Role-based permissions and owner-only operations
- **Value Conservation**: Mathematical guarantees of fair exchange rates
- **Replay Protection**: Order nonces and domain separators prevent attacks
- **Full-Fill Only**: Atomic execution eliminates partial fill vulnerabilities

### API Security
- **HMAC Authentication**: Cryptographic request signing
- **Rate Limiting**: Prevents abuse and DoS attacks
- **Input Validation**: Comprehensive parameter sanitization
- **Environment Isolation**: Secure secret management

### Infrastructure Security
- **Container Isolation**: Network segmentation and access controls
- **Monitoring**: Real-time security alerting and anomaly detection
- **Audit Logging**: Comprehensive transaction trail

## Trading Features

### Order Management
- **Private Orders**: Zero-knowledge order creation and execution
- **Flexible Parameters**: Custom expiry, minimum fills, slippage protection
- **Real-time Updates**: Live order status and market data
- **Transaction History**: Complete audit trail with blockchain verification

### Market Features
- **Multi-token Support**: ETH, USDC, and other Aztec-compatible tokens
- **Price Integration**: Real-time market data and calculations
- **Slippage Protection**: Configurable tolerance limits
- **Order Cancellation**: Secure order lifecycle management

## 🛠️ Development

### Project Structure
```
tsukamoto/aztec-otc-desk/
├── apps/web/                 # Next.js trading interface
├── packages/
│   ├── contracts/           # Noir smart contracts
│   ├── orderflow/          # API service (Bun)
│   └── nodejs-demo/        # CLI tools and scripts
├── docker/                 # Infrastructure configuration
├── scripts/               # Development and deployment tools
└── .github/workflows/     # CI/CD pipeline
```

### Environment Configuration

```bash
# Development
NODE_ENV=development
L2_NODE_URL=http://localhost:8080
DATABASE_URL=postgresql://otc_user:otc_password@localhost:5432/otc_desk
API_HMAC_SECRET=your_secure_secret_here

# Token addresses (update with deployed contracts)
NEXT_PUBLIC_ETH_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
```

### Development Commands

```bash
# Validate environment
node scripts/validate-env.js

# Compile contracts
cd packages/contracts && bun run compile

# Run tests
npm run test                    # All tests
bun run test:nr                # Contract tests
npm run test:e2e               # End-to-end tests


# Start development servers
bun run dev                    # API service
npm run dev                    # Web application

# Database operations
docker-compose exec postgres psql -U otc_user -d otc_desk
```

## 🚢 Deployment

### Production Environment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy with monitoring
docker-compose -f docker-compose.prod.yml up -d

# Health checks
curl http://localhost:3001/health
curl http://localhost:5173/api/health
```

## 🧪 Testing

### Test Orders

```bash
# Create test accounts
cd packages/nodejs-demo
bun run scripts/setup_accounts.ts

# Create sample order
bun run scripts/create_order.ts

# Fill order
bun run scripts/fill_order.ts
```

### Load Testing

```bash
# Run performance tests
k6 run scripts/load-test.js
```

## 🔍 Monitoring

### Grafana Dashboards
- **OTC Overview**: Key business and technical metrics
- **Order Analytics**: Trading volume and success rates
- **System Health**: Infrastructure performance monitoring
- **Security Dashboard**: Authentication and security events

### Key Metrics
- Order creation rate and success percentage
- API response times (p50, p95, p99)
- Database query performance
- Aztec network connectivity
- Error rates and security violations

## 🐛 Troubleshooting

### Common Issues

**Services not starting:**
```bash
# Check Docker status
docker-compose ps
docker-compose logs [service-name]

# Restart services
docker-compose restart [service-name]
```

**Contract compilation errors:**
```bash
# Ensure Aztec CLI is installed
curl -L https://aztec.network/install | bash

# Clean and rebuild
cd packages/contracts
rm -rf target artifacts
bun run compile
```

**Database connection issues:**
```bash
# Reset database
docker-compose down -v
docker-compose up -d postgres
```

### Logs and Debugging

```bash
# View service logs
docker-compose logs -f [service-name]

# Debug API issues
curl http://localhost:3001/health
curl http://localhost:3001/metrics

# Monitor real-time metrics
open http://localhost:3000  # Grafana
open http://localhost:9090  # Prometheus
```

## 📞 Support

### Documentation
- **Smart Contracts**: `packages/contracts/README.md`
- **API Reference**: `packages/orderflow/docs/`
- **Frontend Guide**: `apps/web/README.md`
- **Infrastructure**: `docker/README.md`

### Development Resources
- **Aztec Documentation**: https://docs.aztec.network
- **Project Roadmap**: `backlog.md`
- **Security Guidelines**: `SECURITY.md`
- **Contributing**: `CONTRIBUTING.md`

---

## 📄 License

TBD

## 🏗️ Built With

- **Aztec Network** - Privacy-focused Ethereum L2 
- **Noir** - Zero-knowledge smart contract language
- **TypeScript** - Type-safe development
- **React/Next.js** - Modern web framework
- **Bun** - Fast JavaScript runtime
- **PostgreSQL** - Reliable database
- **Docker** - Containerized deployment
- **Prometheus/Grafana** - Monitoring and observability

---

*Tsukamoto Private OTC Desk - Enterprise-grade private trading infrastructure*