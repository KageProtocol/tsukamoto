export function TokenIcon({ symbol, size = 16 }: { symbol: string; size?: number }) {
  const getTokenColor = (symbol: string) => {
    const colors: Record<string, string> = {
      ETH: "#627eea",
      USDC: "#2775ca",
      USDT: "#26a17b",
      BTC: "#f7931a",
      DAI: "#f5ac37",
      WETH: "#627eea",
      // Add more token colors as needed
    };
    return colors[symbol.toUpperCase()] || "#5cc8ff";
  };

  const getTokenGradient = (symbol: string) => {
    const gradients: Record<string, string> = {
      ETH: "linear-gradient(135deg, #627eea 0%, #8a9dff 100%)",
      USDC: "linear-gradient(135deg, #2775ca 0%, #4f9eff 100%)",
      USDT: "linear-gradient(135deg, #26a17b 0%, #4fc4a0 100%)",
      BTC: "linear-gradient(135deg, #f7931a 0%, #ffb347 100%)",
      DAI: "linear-gradient(135deg, #f5ac37 0%, #ffcc70 100%)",
      WETH: "linear-gradient(135deg, #627eea 0%, #8a9dff 100%)",
    };
    return gradients[symbol.toUpperCase()] || "linear-gradient(135deg, #5cc8ff 0%, #7dd3ff 100%)";
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: getTokenGradient(symbol),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        fontWeight: 700,
        color: "white",
        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: `0 2px 4px rgba(0,0,0,0.1), inset 0 1px 2px rgba(255,255,255,0.1)`,
      }}
    >
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}