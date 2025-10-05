# Aztec OTC Desk

A private over-the-counter (OTC) trading platform built on the Aztec protocol. Facilitates confidential peer-to-peer token swaps through smart contract escrows using zero-knowledge proofs.

📖 **Read our detailed article:** [https://x.com/bajpaiharsh244/status/1968996432855392747](https://x.com/bajpaiharsh244/status/1968996432855392747)

## 🏗️ Architecture Overview

The Aztec OTC Desk is a monorepo containing four main packages:

- **📄 Contracts**: Aztec Noir smart contracts for OTC escrow with private transfers
- **🖥️ CLI Demo**: Command-line interface for testing order creation and fulfillment
- **🌐 Orderflow Service**: RESTful API for order management and discovery
- **🌐 Web UI**: Next.js application with wallet integration for browser-based trading

## 📦 Packages

### 1. 📄 Contracts (`packages/contracts`)

Aztec Noir smart contracts implementing the core OTC escrow functionality.

**Key Features:**
- **OTC Escrow Contract**: Secure escrow mechanism for token swaps
- **Token Contract**: Standard token implementation for testing
- **Private Transfers**: Leverages Aztec's privacy features
- **Atomic Swaps**: Ensures both parties receive their tokens or the trade fails

**Smart Contracts:**
- `OTCEscrowContract`: Main escrow contract that holds seller's tokens until buyer fulfills the order
- `Token`: Standard token contract compatible with Aztec's privacy features

**Usage:**
```bash
cd packages/contracts

# Install dependencies and build
bun install
bun run build

# Run tests (requires sandbox)
# Terminal 1: Start Aztec sandbox
bun run sandbox

# Terminal 2: Start secondary PXE
bun run pxe:local:1

# Terminal 3: Run tests
bun test
```

### 2. 🖥️ CLI Demo (`packages/nodejs-demo`)

A command-line interface demonstrating the complete OTC trading workflow with two parties: a seller and a buyer.

**Demo Scenario:**
- **Seller** (Wallet #0): Wants to sell 1 WETH for 5000 USDC
- **Buyer** (Wallet #1): Wants to buy 1 WETH for 5000 USDC

**Available Commands:**
- `bun run setup:deploy`: Deploy token contracts and mint initial balances
- `bun run setup:mint`: Mint additional tokens to participants
- `bun run setup:accounts`: Setup and configure trading accounts
- `bun run order:create`: Create a new OTC escrow order (seller)
- `bun run order:fill`: Fill an existing OTC escrow order (buyer)
- `bun run balances`: Check token balances of all participants

**Complete Workflow:**

**⚠️ Prerequisites: Build contracts and make sure the orderflow service is running in the background!**

```bash
# Build contracts first (REQUIRED)
cd packages/contracts
bun install
bun run build

# Start orderflow service (in a separate terminal)
cd packages/orderflow-service
bun install && bun run start
```

```bash
cd packages/nodejs-demo

# 1. Setup environment (run once per sandbox session)
bun install
bun run setup:deploy
bun run setup:mint     # Mint tokens to trading accounts
bun run balances       # Check balances after minting

# 2. Create an OTC order (seller perspective)
bun run order:create

# 3. Fill the order (buyer perspective)
bun run order:fill

# 4. Check final balances
bun run balances
```

### 3. 🌐 Orderflow Service (`packages/orderflow-service`)

A RESTful HTTP service for order management and discovery.

**Key Features:**
- **Order Management**: Create, update, and manage private OTC orders with unique escrow addresses
- **Order Discovery**: Query, filter, and search for existing orders by various parameters
- **Private Order Coordination**: Facilitate secure communication between trading parties
- **SQLite Database**: Persistent storage with pluggable architecture for scalability
- **RESTful API**: Standard HTTP endpoints for seamless integration

**API Endpoints:**

#### Create Order
```bash
POST /order
Content-Type: application/json

{
  "escrowAddress": "0x1234...",
  "sellTokenAddress": "0x5678...",
  "sellTokenAmount": "1000000000000000000",
  "buyTokenAddress": "0x9abc...",
  "buyTokenAmount": "2000000000000000000"
}
```

#### Get Orders
```bash
# Get all orders
GET /order

# Get specific order by ID
GET /order?id=uuid-here

# Filter by escrow address
GET /order?escrow_address=0x1234...

# Filter by token addresses
GET /order?sell_token_address=0x5678...
GET /order?buy_token_address=0x9abc...
```

**Usage:**
```bash
cd packages/orderflow-service

# Install and start
bun install
bun run start  # Production mode (port 3001)
bun run dev    # Development mode with hot reload

# Run tests
bun test                 # All tests
bun run test:db          # Database tests only
bun run test:handlers    # API handler tests only
bun run test:integration # Integration tests only
```

### 4. 🌐 Web UI (`apps/web`)

Next.js application providing browser-based trading interface with wallet integration.

**Key Features:**
- **Wallet Integration**: Connect Aztec test accounts (Seller, Buyer, Test Account 3)
- **Order Creation**: Create OTC orders from connected wallet
- **Order Filling**: Fill orders using connected wallet
- **Portfolio Management**: View balances for connected wallet
- **Real-time Updates**: Auto-refresh orders every 10 seconds
- **Transaction History**: Track order creation and fills
- **Chart Integration**: Price charts for trading pairs

**Wallet System:**
- Account selection modal with 3 sandbox accounts
- Persistent connection via localStorage
- Account index determines transaction signer
- Frontend passes accountIndex to backend
- Backend scripts use WALLET_ACCOUNT_INDEX env var

**Usage:**
```bash
cd apps/web

# Install and start
bun install
bun run dev    # Development mode (port 5173)
bun run build  # Production build

# Environment variables
L2_NODE_URL=http://localhost:8080              # Aztec sandbox
NEXT_PUBLIC_OTC_API_URL=http://localhost:3001  # Orderflow service
NEXT_PUBLIC_ETH_ADDRESS=0x...                  # ETH token address
NEXT_PUBLIC_USDC_ADDRESS=0x...                 # USDC token address
```

**User Flow:**
1. User connects wallet (selects account 0, 1, or 2)
2. Create order: wallet's account index passed to backend
3. Fill order: wallet's account index passed to backend
4. Backend scripts use specified account for transactions
5. Portfolio displays balances for connected account

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.1.22+)
- [Aztec CLI](https://docs.aztec.network/guides/developer_guides/getting_started/quickstart) for sandbox and PXE

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd aztec-otc-desk

# Install dependencies for all packages
bun install

# Install dependencies for each package individually
cd packages/contracts && bun install && cd ../..
cd packages/nodejs-demo && bun install && cd ../..
cd packages/orderflow-service && bun install && cd ../..
```

### Development Setup

#### Prerequisites
```bash
# Build contracts first
cd packages/contracts
bun install
bun run build
```

#### Option 1: Web UI (Recommended)

**Terminal 1 - Aztec Sandbox:**
```bash
cd packages/contracts
bun run sandbox
```

**Terminal 2 - Orderflow Service:**
```bash
cd packages/orderflow-service
bun install
bun run start    # Port 3001
```

**Terminal 3 - Deploy & Mint:**
```bash
cd packages/nodejs-demo
bun install
bun run setup:deploy
bun run setup:mint
```

**Terminal 4 - Web UI:**
```bash
cd apps/web
bun install
bun run dev      # Port 5173
```

Access UI at http://localhost:5173

#### Option 2: CLI Demo

**Terminal 1 - Aztec Sandbox:**
```bash
cd packages/contracts
bun run sandbox
```

**Terminal 2 - Secondary PXE:**
```bash
cd packages/contracts
bun run pxe:local:1
```

**Terminal 3 - Orderflow Service:**
```bash
cd packages/orderflow-service
bun install
bun run start    # Port 3001
```

**Terminal 4 - CLI Commands:**
```bash
cd packages/nodejs-demo
bun install
bun run setup:deploy
bun run setup:mint
bun run balances
bun run order:create
bun run order:fill
bun run balances
```

## 🔧 Development

### Building Contracts

```bash
cd packages/contracts
bun run build
```

### Running Tests

```bash
# Contract tests (requires running sandbox)
cd packages/contracts
bun test

# Orderflow service tests
cd packages/orderflow-service
bun test

# All tests can be run independently
```

### Project Structure

```
aztec-otc-desk/
├── apps/
│   └── web/                     # Next.js web UI
│       ├── app/
│       │   ├── api/            # API routes
│       │   │   ├── order/      # Order creation
│       │   │   ├── fill/       # Order filling
│       │   │   └── balances/   # Balance queries
│       │   ├── components/     # React components
│       │   │   ├── WalletConnect.tsx
│       │   │   ├── PortfolioModal.tsx
│       │   │   └── Chart.tsx
│       │   └── page.tsx        # Main trading page
│       └── lib/
│           └── wallet-provider.tsx  # Wallet state management
├── packages/
│   ├── contracts/               # Aztec Noir contracts
│   │   ├── src/
│   │   │   ├── main.nr         # OTC Escrow Contract
│   │   │   └── types/          # Custom types
│   │   ├── artifacts/          # Compiled artifacts
│   │   └── ts/                 # TypeScript bindings
│   ├── nodejs-demo/             # CLI demo
│   │   ├── scripts/
│   │   │   ├── create_order.ts # Order creation (uses WALLET_ACCOUNT_INDEX)
│   │   │   ├── fill_by_id.ts   # Order filling (uses WALLET_ACCOUNT_INDEX)
│   │   │   └── utils/
│   │   └── data/               # Deployments
│   └── orderflow-service/       # HTTP API
│       ├── src/                # API implementation
│       └── tests/              # Test suite
├── deps/
│   └── aztec-standards/        # Aztec standards
└── scripts/                    # Utility scripts
```

## 🔐 Privacy Features

This OTC desk leverages Aztec's advanced privacy features to ensure confidential trading:

- **Private Balances**: Token balances remain completely private and hidden from public view
- **Confidential Transfers**: Transfer amounts, recipients, and transaction details are kept confidential
- **Selective Disclosure**: Traders maintain full control over what information to reveal and when
- **Zero-Knowledge Proofs**: All operations are cryptographically verified without revealing sensitive trading data
- **Trustless Escrow**: Atomic swaps provide secure, trustless asset exchanges without intermediaries
- **Private Order Books**: Order details remain confidential until parties choose to execute trades

## 🛠️ Technology Stack

- **Smart Contracts**: Aztec Noir
- **Runtime**: Bun
- **Orderflow Service**: Native Bun HTTP server
- **Database**: SQLite (with pluggable architecture)
- **Testing**: Jest with Bun test runner
- **TypeScript**: Full type safety across all packages

## 📚 Usage Examples

### Creating an OTC Order

```typescript
// 1. Deploy escrow contract with trade parameters
const escrow = await OTCEscrowContract.deploy(
  sellTokenAddress,
  sellTokenAmount,
  buyTokenAddress,
  buyTokenAmount
).send().wait();

// 2. Transfer sell tokens to escrow
await sellToken.methods.transfer(escrowAddress, sellTokenAmount).send().wait();

// 3. Register order with orderflow service
const response = await fetch('http://localhost:3000/order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    escrowAddress: escrow.address,
    sellTokenAddress,
    sellTokenAmount: sellTokenAmount.toString(),
    buyTokenAddress,
    buyTokenAmount: buyTokenAmount.toString()
  })
});
```

### Filling an OTC Order

```typescript
// 1. Query available orders
const orders = await fetch('http://localhost:3000/order').then(r => r.json());

// 2. Connect to escrow contract
const escrow = await OTCEscrowContract.at(orders.data[0].escrowAddress);

// 3. Execute the trade
await escrow.methods.fill_order().send().wait();
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Private OTC Desk on Aztec - Project Documentation](https://www.notion.so/aztecnetwork/Private-OTC-Desk-on-Aztec-271a1f6b0e3580088ea5d6d06cbaa2d1?source=copy_link)
- [Aztec Network](https://aztec.network)
- [Aztec Documentation](https://docs.aztec.network)
- [Bun Runtime](https://bun.sh)

---

Built with ❤️ on Aztec Network for private, secure OTC trading.