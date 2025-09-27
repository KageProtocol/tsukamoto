"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi } from "lightweight-charts";
export default function Chart({
  ticker = "ETH-USD",
  interval = "day",
  intervalMultiplier = 1,
  type = "area",
}: {
  ticker?: string;
  interval?: "minute" | "day" | "week" | "month" | "year";
  intervalMultiplier?: number;
  type?: "area" | "candles";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0f0f0f" },
        textColor: "#c7d2da",
      },
      grid: {
        vertLines: { color: "#20252b" },
        horzLines: { color: "#20252b" },
      },
      rightPriceScale: { borderColor: "#2b2b2b" },
      timeScale: { borderColor: "#2b2b2b" },
      height: 360,
    });
    const series =
      type === "candles"
        ? chart.addCandlestickSeries({
            upColor: "#22c55e",
            downColor: "#ef4444",
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
            borderVisible: false,
          })
        : chart.addAreaSeries({
            topColor: "rgba(92,200,255,0.35)",
            bottomColor: "rgba(92,200,255,0.06)",
            lineColor: "#5cc8ff",
            lineWidth: 2,
          });
    chartRef.current = chart;

    const load = async () => {
      const res = await fetch(
        `/api/chart?ticker=${encodeURIComponent(ticker)}&interval=${interval}&interval_multiplier=${intervalMultiplier}`,
      );
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        if (type === "candles") {
          series.setData(json.data);
        } else {
          const area = json.data.map((d: any) => ({
            time: d.time,
            value: d.close,
          }));
          series.setData(area);
        }
      }
    };
    void load();
    const onResize = () =>
      chart.applyOptions({ width: ref.current?.clientWidth || 600 });
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [ticker, interval, intervalMultiplier, type]);

  return <div ref={ref} className="card chart" />;
}
