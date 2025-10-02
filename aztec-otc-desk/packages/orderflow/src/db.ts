import { Pool } from "pg";

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://otc_user:otc_password@localhost:5434/otc_desk",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('📊 Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Order interface
export interface Order {
  id?: string;
  order_id: string;
  escrow_address: string;
  contract_instance: string;
  secret_key?: string;
  partial_address?: string;
  sell_token_address: string;
  sell_token_amount: string;
  buy_token_address: string;
  buy_token_amount: string;
  order_nonce?: string;
  domain_separator?: string;
  min_fill_amount?: string;
  max_slippage_bps?: number;
  expiry_timestamp?: number;
  status?: string;
  created_by?: string;
  workspace_id?: string;
  created_at?: Date;
  updated_at?: Date;
  closed_at?: Date;
}

// Database operations
export const db = {
  // Create a new order
  async createOrder(order: Order): Promise<Order> {
    const query = `
      INSERT INTO orders (
        order_id,
        escrow_address,
        contract_instance,
        secret_key,
        partial_address,
        sell_token_address,
        sell_token_amount,
        buy_token_address,
        buy_token_amount,
        order_nonce,
        domain_separator,
        min_fill_amount,
        max_slippage_bps,
        expiry_timestamp,
        status,
        created_by,
        workspace_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const values = [
      order.order_id,
      order.escrow_address,
      order.contract_instance,
      order.secret_key || null,
      order.partial_address || null,
      order.sell_token_address,
      order.sell_token_amount,
      order.buy_token_address,
      order.buy_token_amount,
      order.order_nonce || null,
      order.domain_separator || null,
      order.min_fill_amount || null,
      order.max_slippage_bps || null,
      order.expiry_timestamp || null,
      order.status || 'open',
      order.created_by || null,
      order.workspace_id || null,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // Get all orders with optional filters
  async getOrders(filters?: {
    status?: string;
    limit?: number;
    offset?: number;
    sellToken?: string;
    buyToken?: string;
  }): Promise<Order[]> {
    let query = `
      SELECT * FROM orders
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      values.push(filters.status);
      paramIndex++;
    }

    if (filters?.sellToken) {
      query += ` AND sell_token_address = $${paramIndex}`;
      values.push(filters.sellToken);
      paramIndex++;
    }

    if (filters?.buyToken) {
      query += ` AND buy_token_address = $${paramIndex}`;
      values.push(filters.buyToken);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    if (filters?.limit) {
      query += ` LIMIT $${paramIndex}`;
      values.push(filters.limit);
      paramIndex++;
    }

    if (filters?.offset) {
      query += ` OFFSET $${paramIndex}`;
      values.push(filters.offset);
      paramIndex++;
    }

    const result = await pool.query(query, values);
    return result.rows;
  },

  // Get order by ID
  async getOrderById(orderId: string): Promise<Order | null> {
    const query = `SELECT * FROM orders WHERE order_id = $1`;
    const result = await pool.query(query, [orderId]);
    return result.rows[0] || null;
  },

  // Get order by escrow address
  async getOrderByEscrowAddress(escrowAddress: string): Promise<Order | null> {
    const query = `SELECT * FROM orders WHERE escrow_address = $1`;
    const result = await pool.query(query, [escrowAddress]);
    return result.rows[0] || null;
  },

  // Update order status
  async updateOrderStatus(
    orderId: string,
    status: 'open' | 'filled' | 'cancelled' | 'expired',
    performedBy?: string
  ): Promise<Order | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current order for audit log
      const currentOrder = await client.query(
        'SELECT * FROM orders WHERE order_id = $1',
        [orderId]
      );

      if (currentOrder.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const oldStatus = currentOrder.rows[0].status;

      // Update order
      const updateQuery = `
        UPDATE orders
        SET status = $1::varchar,
            closed_at = CASE WHEN $1::varchar IN ('filled', 'cancelled', 'expired') THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE order_id = $2
        RETURNING *
      `;
      const result = await client.query(updateQuery, [status, orderId]);

      // Create audit log
      await client.query(
        `INSERT INTO order_audit_log (order_id, action, old_status, new_status, performed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, status, oldStatus, status, performedBy || 'system']
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Get order count
  async getOrderCount(status?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM orders';
    const values: any[] = [];

    if (status) {
      query += ' WHERE status = $1';
      values.push(status);
    }

    const result = await pool.query(query, values);
    return parseInt(result.rows[0].count);
  },

  // Close pool connection
  async close() {
    await pool.end();
  }
};

export default db;
