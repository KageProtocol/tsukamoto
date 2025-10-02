# Escrow-Link: Private Bilateral OTC Trading

## 🎯 Vision
"PayPal for OTC" - Generate private escrow links for direct P2P trades on Aztec.

## Overview
Escrow-Link enables sellers to create one-time, private links for bilateral OTC trades. Instead of listing orders publicly, sellers generate secure links and send them directly to specific counterparties via Telegram, Discord, or email.

## Key Features

### ✅ Core Functionality
- **One-Click Trade Links**: Generate shareable escrow URLs
- **Private & Trustless**: Full Aztec privacy + escrow guarantees
- **Single-Use Security**: Links expire after first fill
- **Whitelist Support**: Restrict fills to specific addresses

### 🔐 Security Features
- Whitelist counterparty addresses
- Password-protected links
- Time-based expiry
- Single-use token enforcement
- No on-chain data leakage

### 🚀 Use Cases
- **P2P Deals**: Direct peer-to-peer trades
- **Institutional**: Employee → Fund, DAO → DAO swaps
- **Fundraising**: Generate links for investors
- **Team Operations**: Internal token distributions

## Architecture

### Shared Infrastructure
- **Escrow Contracts**: Re-uses `aztec-otc-desk` escrow contracts
- **UI Components**: Shares design system with main OTC platform
- **Database**: Extends orderflow PostgreSQL with link tables

### New Components
- **Link Service**: Token generation, validation, expiry management
- **Link API**: REST endpoints for create/validate/fill
- **Link UI**: Dedicated fill page for link-based trades

## Project Structure

```
escrow-link/
├── packages/
│   └── link-service/       # Link generation & validation service
│       ├── src/
│       │   ├── index.ts    # Main service entry
│       │   ├── db/         # Database schemas & queries
│       │   ├── auth/       # Token generation & validation
│       │   └── api/        # API endpoints
│       └── package.json
│
└── apps/
    └── link-ui/            # Frontend for link fills
        ├── src/
        │   ├── pages/
        │   │   └── fill/   # Fill page for links
        │   └── components/ # Shared UI from aztec-otc-desk
        └── package.json
```

## API Endpoints

### Create Link
```http
POST /escrow-link/create
Content-Type: application/json

{
  "escrowAddress": "0x...",
  "whitelistAddress": "0x...",  // optional
  "expiryHours": 24,            // optional
  "password": "secret123"       // optional
}

Response:
{
  "linkToken": "abc123xyz",
  "url": "https://tsukamoto.xyz/escrow/fill?token=abc123xyz",
  "expiresAt": "2024-10-03T12:00:00Z"
}
```

### Validate Link
```http
GET /escrow-link/validate/:token

Response:
{
  "valid": true,
  "escrowAddress": "0x...",
  "whitelistAddress": "0x...",  // if set
  "expiresAt": "2024-10-03T12:00:00Z",
  "requiresPassword": true      // if set
}
```

### Fill via Link
```http
POST /escrow-link/fill/:token
Content-Type: application/json

{
  "fillerAddress": "0x...",
  "password": "secret123"       // if required
}

Response:
{
  "success": true,
  "escrowAddress": "0x...",
  "txHash": "0x..."
}
```

## Database Schema

```sql
CREATE TABLE escrow_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_token TEXT UNIQUE NOT NULL,
  escrow_id TEXT NOT NULL,
  escrow_address TEXT NOT NULL,
  creator_address TEXT NOT NULL,
  whitelist_address TEXT,           -- optional: restrict to specific filler
  password_hash TEXT,                -- optional: password protection
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,                 -- filled when link is used
  used_by TEXT,                      -- address that used the link
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_link_token (link_token),
  INDEX idx_escrow_address (escrow_address),
  INDEX idx_expires_at (expires_at)
);

CREATE TABLE link_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID REFERENCES escrow_links(id),
  event_type TEXT NOT NULL,          -- view, fill, expire
  user_address TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Implementation Phases

### Phase 4.1: MVP (Week 1-2)
- [ ] Database schema & migrations
- [ ] Link generation API
- [ ] Token validation logic
- [ ] Basic fill endpoint
- [ ] Simple fill UI page

### Phase 4.2: Security (Week 3)
- [ ] Whitelist validation
- [ ] Password protection
- [ ] Expiry automation
- [ ] Single-use enforcement
- [ ] Audit logging

### Phase 4.3: Distribution (Week 4)
- [ ] Social share buttons
- [ ] QR code generation
- [ ] Link preview cards
- [ ] Analytics dashboard
- [ ] Batch link creation

### Phase 4.4: Institutional (Week 5-6)
- [ ] Team workspace management
- [ ] zk-KYC integration
- [ ] Custom branding
- [ ] Webhook notifications
- [ ] Bulk operations API

## Integration with Main Platform

### Shared Resources
- **Contracts**: Same OTCEscrowContract from aztec-otc-desk
- **Design System**: Tailwind config, color palette, components
- **Token Registry**: Shared token metadata
- **Authentication**: Same HMAC/JWT patterns

### Separate Concerns
- **Link Management**: Independent service & database tables
- **API Layer**: Dedicated endpoints under `/escrow-link/*`
- **UI Routes**: Separate pages under `/fill/*`

## Development Setup

1. **Prerequisites**:
   - Running `aztec-otc-desk` infrastructure
   - PostgreSQL with link tables
   - Access to shared UI components

2. **Install Dependencies**:
   ```bash
   cd /Users/lucidsamuel/Downloads/tsukamoto/escrow-link
   bun install
   ```

3. **Run Link Service**:
   ```bash
   cd packages/link-service
   bun run dev
   ```

4. **Environment Variables**:
   ```bash
   DATABASE_URL=postgresql://otc_user:otc_password@localhost:5434/otc_desk
   LINK_SECRET=your_link_signing_secret_32_chars_min
   LINK_EXPIRY_DEFAULT_HOURS=24
   BASE_URL=http://localhost:3001
   ```

## Security Considerations

### Privacy
- ✅ Links map to off-chain identifiers only
- ✅ No note commitments in URLs
- ✅ Escrow details fetched server-side
- ✅ Zero on-chain metadata leakage

### Front-Running Protection
- ✅ Whitelist enforcement (optional)
- ✅ Password protection (optional)
- ✅ Time-based expiry
- ✅ Single-use token burning

### Best Practices
- Use HTTPS only for links
- Rotate link signing secrets
- Monitor for suspicious patterns
- Rate limit link generation
- Log all link operations

## Success Metrics

### Adoption
- Links created per day
- Link→fill conversion rate
- % of volume via links vs orderbook

### Engagement
- Average time to fill
- Shares per link
- New users via link referrals

### Security
- Zero front-running incidents
- 100% whitelist enforcement
- <1% expired link attempts

## Roadmap Alignment

This feature complements the main OTC platform:
- **Main Platform**: Public orderbook discovery (1:many)
- **Escrow-Link**: Private bilateral trades (1:1)

Together: Complete OTC spectrum from open discovery to private execution.

---

**Status**: 📋 Documented - Ready for Phase 4 implementation
**Dependencies**: aztec-otc-desk Phase 1-3 complete
**Timeline**: 4-6 weeks for full feature set

// AI slop -- forgive me 
