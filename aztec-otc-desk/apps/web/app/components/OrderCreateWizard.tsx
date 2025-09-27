"use client";
import { useState, useEffect } from "react";
import TokenSelect from "./TokenSelect";
import { TokenIcon } from "./TokenIcon";
import { toast } from "./ToastStack";

type TokenOption = {
  label: string;
  address: string;
  ticker: string;
  decimals: number;
};

type OrderParams = {
  sellToken: string;
  sellAmount: string;
  buyToken: string;
  buyAmount: string;
  expiry: number; // hours
  minFill?: string;
  slippageBps?: number;
};

export default function OrderCreateWizard({
  isOpen,
  onClose,
  onSuccess,
  tokenOptions,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (orderData?: any) => void;
  tokenOptions: TokenOption[];
}) {
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useState<OrderParams>({
    sellToken: "",
    sellAmount: "",
    buyToken: "",
    buyAmount: "",
    expiry: 24,
    minFill: "",
    slippageBps: 50, // 0.5%
  });

  const [sellUsd, setSellUsd] = useState<number | null>(null);
  const [buyUsd, setBuyUsd] = useState<number | null>(null);
  const [errors, setErrors] = useState<Partial<OrderParams>>({});
  const [autoCalculate, setAutoCalculate] = useState(false);
  const [lastCalculatedField, setLastCalculatedField] = useState<"sell" | "buy" | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setParams({
        sellToken: "",
        sellAmount: "",
        buyToken: "",
        buyAmount: "",
        expiry: 24,
        minFill: "",
        slippageBps: 50,
      });
      setErrors({});
    }
  }, [isOpen]);

  const validateStep = (stepNumber: number): boolean => {
    const newErrors: Partial<OrderParams> = {};

    if (stepNumber === 1) {
      if (!params.sellToken) newErrors.sellToken = "Sell token is required";
      if (!params.sellAmount || params.sellAmount.trim() === "" || isNaN(Number(params.sellAmount)) || Number(params.sellAmount) <= 0) {
        newErrors.sellAmount = "Please enter a valid amount greater than 0";
      }
    } else if (stepNumber === 2) {
      if (!params.buyToken) newErrors.buyToken = "Buy token is required";
      if (!params.buyAmount || params.buyAmount.trim() === "" || isNaN(Number(params.buyAmount)) || Number(params.buyAmount) <= 0) {
        newErrors.buyAmount = "Please enter a valid amount greater than 0";
      }
      if (params.sellToken === params.buyToken) {
        newErrors.buyToken = "Buy token must be different from sell token";
      }
    } else if (stepNumber === 3) {
      if (params.expiry < 1 || params.expiry > 168) {
        newErrors.expiry = "Expiry must be between 1 and 168 hours" as any;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const loadUsdHint = async (tokenAddress: string, setFn: (v: number | null) => void) => {
    const token = tokenOptions.find(t => t.address?.toLowerCase() === tokenAddress?.toLowerCase());
    if (!token) {
      setFn(null);
      return;
    }
    try {
      const res = await fetch(`/api/price?ticker=${encodeURIComponent(token.ticker)}`);
      const json = await res.json();
      setFn(json?.success ? json.price : null);
    } catch {
      setFn(null);
    }
  };

  const createOrder = async () => {
    if (!validateStep(3)) return;

    setCreating(true);
    try {
      const res = await fetch("/api/order/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellTokenAddress: params.sellToken,
          sellTokenAmount: params.sellAmount,
          buyTokenAddress: params.buyToken,
          buyTokenAmount: params.buyAmount,
          expiryHours: params.expiry,
          minFillAmount: params.minFill || undefined,
          slippageBps: params.slippageBps,
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Create failed");

      toast.success("Order created successfully!");

      // Pass order data to the success callback
      const orderData = {
        sellTokenAddress: params.sellToken,
        sellTokenAmount: params.sellAmount,
        buyTokenAddress: params.buyToken,
        buyTokenAmount: params.buyAmount,
        orderId: json.orderId || `order_${Date.now()}` // Fallback if orderId not returned
      };

      onSuccess(orderData);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const getToken = (address: string) => tokenOptions.find(t => t.address?.toLowerCase() === address?.toLowerCase());

  const estimatePrice = () => {
    const sellAmount = Number(params.sellAmount);
    const buyAmount = Number(params.buyAmount);
    if (sellAmount > 0 && buyAmount > 0) {
      return buyAmount / sellAmount;
    }
    return null;
  };

  const calculateAmountFromMarketPrice = async (fromToken: string, toToken: string, amount: string, direction: "sell" | "buy") => {
    if (!amount || !fromToken || !toToken || Number(amount) <= 0) return;

    const fromTokenData = tokenOptions.find(t => t.address === fromToken);
    const toTokenData = tokenOptions.find(t => t.address === toToken);

    if (!fromTokenData || !toTokenData) return;

    try {
      // Get current market prices for both tokens
      const [fromPriceRes, toPriceRes] = await Promise.all([
        fetch(`/api/price?ticker=${fromTokenData.ticker}`),
        fetch(`/api/price?ticker=${toTokenData.ticker}`)
      ]);

      const [fromPriceData, toPriceData] = await Promise.all([
        fromPriceRes.json(),
        toPriceRes.json()
      ]);

      const fromPrice = fromPriceData?.success ? fromPriceData.price : null;
      const toPrice = toPriceData?.success ? toPriceData.price : null;

      if (fromPrice && toPrice) {
        const exchangeRate = fromPrice / toPrice;
        const calculatedAmount = (Number(amount) * exchangeRate).toFixed(6);

        if (direction === "sell") {
          // Calculate buy amount from sell amount
          setParams(prev => ({ ...prev, buyAmount: calculatedAmount }));
          setLastCalculatedField("buy");
        } else {
          // Calculate sell amount from buy amount
          setParams(prev => ({ ...prev, sellAmount: calculatedAmount }));
          setLastCalculatedField("sell");
        }
      }
    } catch (error) {
      console.error("Failed to calculate market price:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    }}>
      <div className="card" style={{
        width: "100%",
        maxWidth: 480,
        maxHeight: "90vh",
        overflow: "auto",
        margin: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Create Order</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[1, 2, 3].map((stepNum) => (
            <div key={stepNum} style={{
              flex: 1,
              height: 4,
              background: step >= stepNum ? "#5cc8ff" : "#333",
              borderRadius: 2,
            }} />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h3>What are you selling?</h3>
            <div className="section">
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#9aa3ad" }}>
                Sell Token
              </label>
              <TokenSelect
                value={params.sellToken}
                onChange={(value) => {
                  setParams({ ...params, sellToken: value });
                  loadUsdHint(value, setSellUsd);
                }}
                options={tokenOptions}
                placeholder="Select token to sell..."
              />
              {errors.sellToken && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{errors.sellToken}</p>}
            </div>

            <div className="section">
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#9aa3ad" }}>
                Amount to Sell
              </label>
              <div className="row">
                <input
                  className="input"
                  type="number"
                  placeholder="0.0"
                  value={params.sellAmount}
                  onChange={(e) => setParams({ ...params, sellAmount: e.target.value })}
                />
                <span className="pill" style={{ minWidth: 120, textAlign: "center" }}>
                  {sellUsd && params.sellAmount
                    ? `~ $${(Number(params.sellAmount) * sellUsd).toLocaleString()}`
                    : "~ $0.00"}
                </span>
              </div>
              {errors.sellAmount && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{errors.sellAmount}</p>}
            </div>

            <div className="row section" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={nextStep}>
                Next: Choose what to receive
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3>What do you want in return?</h3>
            <div className="section">
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#9aa3ad" }}>
                Buy Token
              </label>
              <TokenSelect
                value={params.buyToken}
                onChange={(value) => {
                  setParams({ ...params, buyToken: value });
                  loadUsdHint(value, setBuyUsd);
                }}
                options={tokenOptions}
                placeholder="Select token to receive..."
              />
              {errors.buyToken && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{errors.buyToken}</p>}
            </div>

            <div className="section">
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#9aa3ad" }}>
                Amount to Receive
              </label>
              <div className="row">
                <input
                  className="input"
                  type="number"
                  placeholder="0.0"
                  value={params.buyAmount}
                  onChange={(e) => setParams({ ...params, buyAmount: e.target.value })}
                />
                <span className="pill" style={{ minWidth: 120, textAlign: "center" }}>
                  {buyUsd && params.buyAmount
                    ? `~ $${(Number(params.buyAmount) * buyUsd).toLocaleString()}`
                    : "~ $0.00"}
                </span>
              </div>
              {errors.buyAmount && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{errors.buyAmount}</p>}
            </div>

            {estimatePrice() && (
              <div className="section" style={{ padding: 12, background: "#1a1a1a", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#9aa3ad" }}>Exchange Rate</div>
                <div>
                  1 {getToken(params.sellToken)?.label} = {estimatePrice()?.toFixed(4)} {getToken(params.buyToken)?.label}
                </div>
              </div>
            )}

            <div className="section">
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#9aa3ad" }}>
                Auto-Calculate Price
              </label>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  if (e.target.value === "market") {
                    calculateAmountFromMarketPrice(params.sellToken, params.buyToken, params.sellAmount, "sell");
                  }
                  e.target.value = ""; // Reset select after use
                }}
                disabled={!params.sellToken || !params.buyToken || !params.sellAmount}
              >
                <option value="">Choose pricing method...</option>
                <option value="market">📈 Use Current Market Price</option>
              </select>
              <p style={{ fontSize: 12, color: "#9aa3ad", marginTop: 4 }}>
                Auto-calculate buy amount from current market rates
              </p>
            </div>

            <div className="row section" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={prevStep}>Back</button>
              <button className="btn btn-primary" onClick={nextStep}>
                Next: Order settings
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3>Order Settings</h3>

            <div className="section">
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#9aa3ad" }}>
                Expiry (hours)
              </label>
              <select
                className="input"
                value={params.expiry}
                onChange={(e) => setParams({ ...params, expiry: Number(e.target.value) })}
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={24}>24 hours</option>
                <option value={72}>3 days</option>
                <option value={168}>1 week</option>
              </select>
            </div>

            <div className="section">
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#9aa3ad" }}>
                Maximum Slippage (basis points)
              </label>
              <select
                className="input"
                value={params.slippageBps}
                onChange={(e) => setParams({ ...params, slippageBps: Number(e.target.value) })}
              >
                <option value={10}>0.1% (10 bps)</option>
                <option value={50}>0.5% (50 bps)</option>
                <option value={100}>1% (100 bps)</option>
                <option value={250}>2.5% (250 bps)</option>
                <option value={500}>5% (500 bps)</option>
              </select>
            </div>

            <div className="section">
              <label style={{ display: "block", marginBottom: 8, fontSize: 14, color: "#9aa3ad" }}>
                Minimum Fill Amount (optional)
              </label>
              <input
                className="input"
                type="number"
                placeholder="Leave empty for no minimum"
                value={params.minFill}
                onChange={(e) => setParams({ ...params, minFill: e.target.value })}
              />
            </div>

            <div className="section" style={{ padding: 16, background: "#1a1a1a", borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 12px 0" }}>Order Summary</h4>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span>Selling:</span>
                <TokenIcon symbol={getToken(params.sellToken)?.label || ""} size={16} />
                <span>{params.sellAmount} {getToken(params.sellToken)?.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span>For:</span>
                <TokenIcon symbol={getToken(params.buyToken)?.label || ""} size={16} />
                <span>{params.buyAmount} {getToken(params.buyToken)?.label}</span>
              </div>
              <div style={{ fontSize: 12, color: "#9aa3ad" }}>
                Expires in {params.expiry} hours • Max slippage: {(params.slippageBps || 0) / 100}%
              </div>
            </div>

            <div className="row section" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={prevStep}>Back</button>
              <button
                className="btn btn-primary btn-lg"
                onClick={createOrder}
                disabled={creating}
              >
                {creating ? "Creating Order..." : "Create Order"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}