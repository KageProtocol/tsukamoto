-- Initialize OTC Desk Database
-- This script sets up the database schema for development

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create orders table with enhanced safety parameters
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(255) UNIQUE NOT NULL,
    escrow_address VARCHAR(255) NOT NULL,
    contract_instance TEXT NOT NULL,

    -- Token and amount information
    sell_token_address VARCHAR(255) NOT NULL,
    sell_token_amount VARCHAR(255) NOT NULL,
    buy_token_address VARCHAR(255) NOT NULL,
    buy_token_amount VARCHAR(255) NOT NULL,

    -- Enhanced safety parameters
    order_nonce VARCHAR(255),
    domain_separator VARCHAR(255),
    min_fill_amount VARCHAR(255),
    max_slippage_bps INTEGER,
    expiry_timestamp BIGINT,

    -- Order status and metadata
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    created_by VARCHAR(255),
    workspace_id VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('open', 'filled', 'cancelled', 'expired')),
    CONSTRAINT positive_amounts CHECK (
        sell_token_amount::NUMERIC > 0 AND
        buy_token_amount::NUMERIC > 0
    ),
    CONSTRAINT valid_slippage CHECK (
        max_slippage_bps IS NULL OR
        (max_slippage_bps >= 1 AND max_slippage_bps <= 10000)
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_escrow_address ON orders(escrow_address);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tokens ON orders(sell_token_address, buy_token_address);
CREATE INDEX IF NOT EXISTS idx_orders_workspace ON orders(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_nonce ON orders(order_nonce) WHERE order_nonce IS NOT NULL;

-- Create composite index for order lifecycle queries
CREATE INDEX IF NOT EXISTS idx_orders_lifecycle ON orders(status, created_at DESC, escrow_address);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create audit log table for security tracking
CREATE TABLE IF NOT EXISTS order_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    performed_by VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_action CHECK (action IN ('created', 'filled', 'cancelled', 'expired', 'updated'))
);

CREATE INDEX IF NOT EXISTS idx_audit_order_id ON order_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON order_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON order_audit_log(action);

-- Create metrics table for monitoring
CREATE TABLE IF NOT EXISTS order_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    tags JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON order_metrics(metric_name, created_at DESC);

-- Insert initial development data (optional)
-- This can be uncommented for development environments
/*
INSERT INTO orders (
    order_id,
    escrow_address,
    contract_instance,
    sell_token_address,
    sell_token_amount,
    buy_token_address,
    buy_token_amount,
    order_nonce,
    domain_separator,
    min_fill_amount,
    max_slippage_bps,
    expiry_timestamp,
    status
) VALUES (
    'dev-sample-order-001',
    '0x1234567890abcdef1234567890abcdef12345678',
    '{"sample": "contract"}',
    '0xeth1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
    '1000000000000000000',
    '0xusdc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abc',
    '5000000000000000000000',
    'dev_nonce_001',
    'AZTEC_OTC_DEV_V1',
    '100000000000000000',
    50,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP + INTERVAL '24 hours'))::BIGINT,
    'open'
) ON CONFLICT (order_id) DO NOTHING;
*/

-- Create database user roles
DO $$
BEGIN
    -- Create read-only role for monitoring
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'otc_readonly') THEN
        CREATE ROLE otc_readonly;
        GRANT CONNECT ON DATABASE otc_desk TO otc_readonly;
        GRANT USAGE ON SCHEMA public TO otc_readonly;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO otc_readonly;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO otc_readonly;
    END IF;

    -- Create metrics role for monitoring system
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'otc_metrics') THEN
        CREATE ROLE otc_metrics;
        GRANT CONNECT ON DATABASE otc_desk TO otc_metrics;
        GRANT USAGE ON SCHEMA public TO otc_metrics;
        GRANT SELECT ON orders, order_audit_log TO otc_metrics;
        GRANT INSERT, SELECT ON order_metrics TO otc_metrics;
    END IF;
END
$$;

-- Enable query statistics for monitoring
-- Ensure pg_stat_statements is configured in postgresql.conf:
-- shared_preload_libraries = 'pg_stat_statements'
-- pg_stat_statements.track = all

COMMENT ON TABLE orders IS 'Main orders table with enhanced safety parameters and comprehensive indexing';
COMMENT ON TABLE order_audit_log IS 'Audit trail for all order state changes for security and compliance';
COMMENT ON TABLE order_metrics IS 'Performance and business metrics for monitoring and analytics';