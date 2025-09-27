import "server-only";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker") || "ETH-USD";
    const interval = url.searchParams.get("interval") || "day";
    const interval_multiplier =
      url.searchParams.get("interval_multiplier") || "1";
    const start_date =
      url.searchParams.get("start_date") ||
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
        .toISOString()
        .slice(0, 10);
    const end_date =
      url.searchParams.get("end_date") || new Date().toISOString().slice(0, 10);

    const apiKey = process.env.FDAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "FDAI_API_KEY missing" }),
        { status: 500 },
      );
    }

    const fdUrl = new URL("https://api.financialdatasets.ai/crypto/prices");
    fdUrl.searchParams.set("ticker", ticker);
    fdUrl.searchParams.set("interval", interval);
    fdUrl.searchParams.set("interval_multiplier", interval_multiplier);
    fdUrl.searchParams.set("start_date", start_date);
    fdUrl.searchParams.set("end_date", end_date);

    const res = await fetch(fdUrl.toString(), {
      headers: { "X-API-KEY": apiKey },
      cache: "no-store",
    });
    let series: any[] = [];
    if (res.ok) {
      const json = await res.json();
      const prices = Array.isArray(json?.prices) ? json.prices : [];
      series = prices.map((p: any) => ({
        time: Math.floor((p.time_milliseconds ?? Date.parse(p.time)) / 1000),
        open: Number(p.open),
        high: Number(p.high),
        low: Number(p.low),
        close: Number(p.close),
      }));
    } else {
      // Fallback: Coinbase public candles (no key). Daily granularity.
      const product = ticker.toUpperCase();
      const gran = 86400; // 1 day
      const cb = new URL(
        `https://api.exchange.coinbase.com/products/${product}/candles`,
      );
      cb.searchParams.set("granularity", String(gran));
      // optional range
      try {
        const cbRes = await fetch(cb.toString(), {
          headers: { Accept: "application/json" },
        });
        if (cbRes.ok) {
          const arr = await cbRes.json();
          // Coinbase returns [ time, low, high, open, close, volume ]
          series = Array.isArray(arr)
            ? arr
                .map((c: any[]) => ({
                  time: Number(c[0]),
                  low: Number(c[1]),
                  high: Number(c[2]),
                  open: Number(c[3]),
                  close: Number(c[4]),
                }))
                .sort((a: any, b: any) => a.time - b.time)
            : [];
        }
      } catch (_) {
        // ignore, return empty series
      }
    }
    return new Response(JSON.stringify({ success: true, data: series }), {
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
