import "server-only";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker") || "ETH-USD";

    // Try FinancialDatasets first
    const apiKey = process.env.FDAI_API_KEY;
    if (apiKey) {
      const fdUrl = new URL("https://api.financialdatasets.ai/crypto/prices");
      fdUrl.searchParams.set("ticker", ticker);
      fdUrl.searchParams.set("interval", "day");
      fdUrl.searchParams.set("interval_multiplier", "1");

      const today = new Date().toISOString().slice(0, 10);
      fdUrl.searchParams.set("start_date", today);
      fdUrl.searchParams.set("end_date", today);

      const res = await fetch(fdUrl.toString(), {
        headers: { "X-API-KEY": apiKey },
        cache: "no-store",
      });

      if (res.ok) {
        const json = await res.json();
        const prices = Array.isArray(json?.prices) ? json.prices : [];
        if (prices.length > 0) {
          const latest = prices[prices.length - 1];
          return new Response(JSON.stringify({
            success: true,
            ticker,
            price: Number(latest.close),
            timestamp: latest.time,
            source: "FinancialDatasets"
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

    // Fallback to Coinbase
    const product = ticker.toUpperCase();
    const cbUrl = `https://api.exchange.coinbase.com/products/${product}/ticker`;

    try {
      const cbRes = await fetch(cbUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (cbRes.ok) {
        const data = await cbRes.json();
        return new Response(JSON.stringify({
          success: true,
          ticker,
          price: Number(data.price),
          timestamp: data.time,
          source: "Coinbase"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (_) {
      // Ignore Coinbase errors
    }

    // If all else fails, return mock data for demo
    const mockPrices: Record<string, number> = {
      "ETH-USD": 3500,
      "USDC-USD": 1.00,
      "BTC-USD": 65000,
    };

    return new Response(JSON.stringify({
      success: true,
      ticker,
      price: mockPrices[ticker] || 100,
      timestamp: new Date().toISOString(),
      source: "Mock"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500 },
    );
  }
}