import type { Pool } from "pg";

export async function runMigrations(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);

  const migrations: { name: string; sql: string }[] = [
    {
      name: "001_init_orders",
      sql: `
        CREATE TABLE IF NOT EXISTS orders (
          "orderId" TEXT PRIMARY KEY,
          "escrowAddress" TEXT NOT NULL UNIQUE,
          "contractInstance" TEXT NOT NULL,
          "secretKey" TEXT NOT NULL,
          "partialAddress" TEXT NOT NULL,
          "sellTokenAddress" TEXT NOT NULL,
          "sellTokenAmount" TEXT NOT NULL,
          "buyTokenAddress" TEXT NOT NULL,
          "buyTokenAmount" TEXT NOT NULL,
          "status" TEXT DEFAULT 'open',
          "expiresAt" INTEGER,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_orders_sell ON orders ("sellTokenAddress");
        CREATE INDEX IF NOT EXISTS idx_orders_buy ON orders ("buyTokenAddress");
        CREATE INDEX IF NOT EXISTS idx_orders_created ON orders ("createdAt");
      `,
    },
  ];

  for (const m of migrations) {
    const { rows } = await pool.query(
      "SELECT 1 FROM migrations WHERE name = $1 LIMIT 1",
      [m.name],
    );
    if (rows.length) continue;
    await pool.query("BEGIN");
    try {
      await pool.query(m.sql);
      await pool.query("INSERT INTO migrations (name) VALUES ($1)", [m.name]);
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  }
}


