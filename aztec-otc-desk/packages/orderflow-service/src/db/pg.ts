import { Pool } from "pg";
import type { Order } from "../types/api";
import type { IDatabase } from "./interface";
import { runMigrations } from "./migrate";

export class PostgresDatabase implements IDatabase {
  private pool: Pool;

  constructor(databaseUrl?: string) {
    const connectionString = databaseUrl || process.env.DATABASE_URL || "";
    if (!connectionString) {
      throw new Error("DATABASE_URL not set for PostgresDatabase");
    }
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    await runMigrations(this.pool);
  }

  async escrowAddressExists(escrowAddress: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      "SELECT 1 FROM orders WHERE \"escrowAddress\" = $1 LIMIT 1",
      [escrowAddress],
    );
    return rows.length > 0;
  }

  async insertOrder(order: Order): Promise<Order> {
    if (await this.escrowAddressExists(order.escrowAddress)) {
      throw new Error(
        `Order with escrow address ${order.escrowAddress} already exists`,
      );
    }
    await this.pool.query(
      `INSERT INTO orders (
        "orderId","escrowAddress","contractInstance","secretKey","partialAddress",
        "sellTokenAddress","sellTokenAmount","buyTokenAddress","buyTokenAmount"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        order.orderId,
        order.escrowAddress,
        order.contractInstance,
        order.secretKey,
        order.partialAddress,
        order.sellTokenAddress,
        order.sellTokenAmount.toString(),
        order.buyTokenAddress,
        order.buyTokenAmount.toString(),
      ],
    );
    return order;
  }

  async getOrderById(orderId: string): Promise<Order | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM orders WHERE "orderId" = $1 LIMIT 1',
      [orderId],
    );
    if (rows.length === 0) return null;
    return this.mapRowToOrder(rows[0]);
  }

  async getOrderByEscrowAddress(escrowAddress: string): Promise<Order | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM orders WHERE "escrowAddress" = $1 LIMIT 1',
      [escrowAddress],
    );
    if (rows.length === 0) return null;
    return this.mapRowToOrder(rows[0]);
  }

  async getAllOrders(): Promise<Order[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM orders ORDER BY "createdAt" DESC',
    );
    return rows.map((r) => this.mapRowToOrder(r));
  }

  async closeOrder(orderId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'DELETE FROM orders WHERE "orderId" = $1',
      [orderId],
    );
    return (rowCount || 0) > 0;
  }

  async getOrdersBySellToken(sellTokenAddress: string): Promise<Order[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM orders WHERE "sellTokenAddress" = $1 ORDER BY "createdAt" DESC',
      [sellTokenAddress],
    );
    return rows.map((r) => this.mapRowToOrder(r));
  }

  async getOrdersByBuyToken(buyTokenAddress: string): Promise<Order[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM orders WHERE "buyTokenAddress" = $1 ORDER BY "createdAt" DESC',
      [buyTokenAddress],
    );
    return rows.map((r) => this.mapRowToOrder(r));
  }

  async getOrdersWithFilters(
    filters: {
      escrowAddress?: string;
      sellTokenAddress?: string;
      buyTokenAddress?: string;
    },
    options?: { limit?: number; offset?: number },
  ): Promise<Order[]> {
    let where = 'WHERE 1=1 AND ("status" = $1) AND ("expiresAt" IS NULL OR "expiresAt" > EXTRACT(EPOCH FROM NOW()))';
    const params: any[] = ["open"];
    let p = 2;
    if (filters.escrowAddress) {
      where += ` AND "escrowAddress" = $${p++}`;
      params.push(filters.escrowAddress);
    }
    if (filters.sellTokenAddress) {
      where += ` AND "sellTokenAddress" = $${p++}`;
      params.push(filters.sellTokenAddress);
    }
    if (filters.buyTokenAddress) {
      where += ` AND "buyTokenAddress" = $${p++}`;
      params.push(filters.buyTokenAddress);
    }
    let limit = "";
    if (options?.limit) {
      limit += ` LIMIT $${p++}`;
      params.push(options.limit);
    }
    if (options?.offset) {
      limit += ` OFFSET $${p++}`;
      params.push(options.offset);
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM orders ${where} ORDER BY "createdAt" DESC${limit}`,
      params,
    );
    return rows.map((r) => this.mapRowToOrder(r));
  }

  close(): void {
    // pool.end returns a promise but interface is sync; fire-and-forget
    void this.pool.end();
  }

  private mapRowToOrder(row: any): Order {
    return {
      orderId: row.orderId,
      escrowAddress: row.escrowaddress,
      contractInstance: row.contractinstance,
      secretKey: row.secretkey,
      partialAddress: row.partialaddress,
      sellTokenAddress: row.selltokenaddress,
      sellTokenAmount: BigInt(row.selltokenamount),
      buyTokenAddress: row.buytokenaddress,
      buyTokenAmount: BigInt(row.buytokenamount),
      status: row.status,
      expiresAt: row.expiresat ? Number(row.expiresat) : undefined,
      createdAt: row.createdat,
    } as any;
  }
}


