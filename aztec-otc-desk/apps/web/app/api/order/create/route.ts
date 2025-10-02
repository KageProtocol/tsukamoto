import "server-only";
import { spawn } from "child_process";
import path from "path";
import crypto from "crypto";

// Increase timeout for order creation (deploying contracts takes time)
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

// Order creation request schema
type OrderCreateRequest = {
  sellTokenAddress: string;
  sellTokenAmount: string;
  buyTokenAddress: string;
  buyTokenAmount: string;
  expiryHours?: number;
  minFillAmount?: string;
  slippageBps?: number;
  orderNonce?: string;
  domainSeparator?: string;
};

// Standardized error response
type ErrorResponse = {
  success: false;
  error: string;
  code: string;
  userMessage: string;
  details?: any;
};

// Success response
type SuccessResponse = {
  success: true;
  orderId: string;
  output: string;
};

// Validation functions
function validateTokenAddress(address: string, fieldName: string): string | null {
  if (!address || typeof address !== 'string') {
    return `${fieldName} is required`;
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(address)) {
    return `${fieldName} must be a valid 64-character hex address`;
  }
  return null;
}

function validateAmount(amount: string, fieldName: string): string | null {
  if (!amount || typeof amount !== 'string') {
    return `${fieldName} is required`;
  }
  const num = Number(amount);
  if (isNaN(num) || num <= 0) {
    return `${fieldName} must be a positive number`;
  }
  return null;
}

function validateOrderParams(params: any): { isValid: boolean; errors: string[]; sanitized?: OrderCreateRequest } {
  const errors: string[] = [];

  // Required field validations
  const sellTokenError = validateTokenAddress(params.sellTokenAddress, 'sellTokenAddress');
  if (sellTokenError) errors.push(sellTokenError);

  const sellAmountError = validateAmount(params.sellTokenAmount, 'sellTokenAmount');
  if (sellAmountError) errors.push(sellAmountError);

  const buyTokenError = validateTokenAddress(params.buyTokenAddress, 'buyTokenAddress');
  if (buyTokenError) errors.push(buyTokenError);

  const buyAmountError = validateAmount(params.buyTokenAmount, 'buyTokenAmount');
  if (buyAmountError) errors.push(buyAmountError);

  // Check for same token
  if (params.sellTokenAddress === params.buyTokenAddress) {
    errors.push('sellTokenAddress and buyTokenAddress cannot be the same');
  }

  // Optional field validations
  const expiryHours = params.expiryHours || 24;
  if (typeof expiryHours !== 'number' || expiryHours < 1 || expiryHours > 168) {
    errors.push('expiryHours must be between 1 and 168 hours');
  }

  const slippageBps = params.slippageBps || 50;
  if (typeof slippageBps !== 'number' || slippageBps < 1 || slippageBps > 10000) {
    errors.push('slippageBps must be between 1 and 10000 (0.01% to 100%)');
  }

  // Validate minFillAmount if provided
  if (params.minFillAmount && params.minFillAmount !== '') {
    const minFillError = validateAmount(params.minFillAmount, 'minFillAmount');
    if (minFillError) errors.push(minFillError);

    // MinFill should not exceed sellAmount
    if (Number(params.minFillAmount) > Number(params.sellTokenAmount)) {
      errors.push('minFillAmount cannot exceed sellTokenAmount');
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  // Generate order nonce and domain separator if not provided
  const orderNonce = params.orderNonce || crypto.randomBytes(16).toString('hex');
  const domainSeparator = params.domainSeparator || 'AZTEC_OTC_V1';

  return {
    isValid: true,
    errors: [],
    sanitized: {
      sellTokenAddress: params.sellTokenAddress,
      sellTokenAmount: params.sellTokenAmount,
      buyTokenAddress: params.buyTokenAddress,
      buyTokenAmount: params.buyTokenAmount,
      expiryHours,
      minFillAmount: params.minFillAmount || '',
      slippageBps,
      orderNonce,
      domainSeparator
    }
  };
}

function createErrorResponse(code: string, userMessage: string, details?: any): ErrorResponse {
  return {
    success: false,
    error: details || userMessage,
    code,
    userMessage,
    details
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.text();
    let orderParams = null;

    // Parse and validate JSON body
    try {
      if (!body.trim()) {
        return new Response(
          JSON.stringify(createErrorResponse(
            'INVALID_REQUEST',
            'Request body is required'
          )),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      orderParams = JSON.parse(body);
    } catch (parseError) {
      return new Response(
        JSON.stringify(createErrorResponse(
          'INVALID_JSON',
          'Invalid JSON in request body',
          (parseError as Error).message
        )),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate order parameters
    const validation = validateOrderParams(orderParams);
    if (!validation.isValid) {
      return new Response(
        JSON.stringify(createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid order parameters',
          validation.errors
        )),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const validatedParams = validation.sanitized!;

    const root = path.resolve(process.cwd(), "../..");
    const scriptPath = path.resolve(
      root,
      "packages/nodejs-demo/scripts/create_order.ts",
    );
    const env = {
      ...process.env,
      L2_NODE_URL: process.env.L2_NODE_URL || "http://localhost:8080",
      API_URL:
        process.env.OTC_API_URL ||
        process.env.NEXT_PUBLIC_OTC_API_URL ||
        "http://localhost:3001",
      API_HMAC_SECRET:
        process.env.OTC_HMAC_SECRET || process.env.API_HMAC_SECRET || "development_secret_key_32_chars_min",
    };

    // Add validated parameters to environment
    console.log("Creating order with validated parameters:", {
      sellToken: validatedParams.sellTokenAddress.slice(0, 10) + '...',
      sellAmount: validatedParams.sellTokenAmount,
      buyToken: validatedParams.buyTokenAddress.slice(0, 10) + '...',
      buyAmount: validatedParams.buyTokenAmount,
      expiryHours: validatedParams.expiryHours,
      slippageBps: validatedParams.slippageBps
    });

    env.WIZARD_SELL_TOKEN = validatedParams.sellTokenAddress;
    env.WIZARD_SELL_AMOUNT = validatedParams.sellTokenAmount;
    env.WIZARD_BUY_TOKEN = validatedParams.buyTokenAddress;
    env.WIZARD_BUY_AMOUNT = validatedParams.buyTokenAmount;
    env.WIZARD_EXPIRY_HOURS = validatedParams.expiryHours!.toString();
    env.WIZARD_MIN_FILL = validatedParams.minFillAmount || "";
    env.WIZARD_SLIPPAGE_BPS = validatedParams.slippageBps!.toString();
    env.WIZARD_ORDER_NONCE = validatedParams.orderNonce!;
    env.WIZARD_DOMAIN_SEPARATOR = validatedParams.domainSeparator!;
    env.USE_WIZARD_PARAMS = "true";

    const child = spawn("bun", ["run", scriptPath], {
      env,
      cwd: root,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const errored: { err?: Error } = {};
    child.on("error", (err) => {
      errored.err = err as Error;
    });

    await new Promise((resolve) => child.on("close", resolve));
    const code = child.exitCode ?? 1;

    console.log('[Order Create] Script exited with code:', code);
    console.log('[Order Create] Stdout length:', stdout.length);
    console.log('[Order Create] Stderr length:', stderr.length);
    console.log('[Order Create] Last 500 chars of stdout:', stdout.slice(-500));
    console.log('[Order Create] Last 500 chars of stderr:', stderr.slice(-500));

    if (errored.err) {
      console.error('[Order Create] Process error:', errored.err);
      return new Response(
        JSON.stringify(createErrorResponse(
          'EXECUTION_ERROR',
          'Failed to execute order creation script',
          errored.err.message
        )),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (code !== 0) {
      const raw = (stderr || stdout || "").toString();
      let errorCode = 'CREATE_FAILED';
      let userMessage = 'Order creation failed';

      // Enhanced error detection and mapping
      if (/Balance too low|Insufficient balance/i.test(raw)) {
        errorCode = 'INSUFFICIENT_BALANCE';
        userMessage = 'Insufficient private balance. Please mint tokens and retry.';
      } else if (/OTC_HMAC_SECRET|API_HMAC_SECRET/i.test(raw)) {
        errorCode = 'MISSING_CONFIG';
        userMessage = 'Server configuration error. Please contact support.';
      } else if (/Token not found|Invalid token/i.test(raw)) {
        errorCode = 'INVALID_TOKEN';
        userMessage = 'Invalid token address. Please check your token selection.';
      } else if (/Timeout|Connection refused/i.test(raw)) {
        errorCode = 'NETWORK_ERROR';
        userMessage = 'Network connectivity issue. Please try again.';
      } else if (/Already exists|Duplicate/i.test(raw)) {
        errorCode = 'DUPLICATE_ORDER';
        userMessage = 'Order already exists. Please check your order history.';
      }

      return new Response(
        JSON.stringify(createErrorResponse(
          errorCode,
          userMessage,
          raw.slice(0, 2000)
        )),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract order ID from output if available
    let orderId = '';
    const orderIdMatch = stdout.match(/Order ID[:\s]+([a-zA-Z0-9_-]+)/);
    if (orderIdMatch) {
      orderId = orderIdMatch[1];
    } else {
      // Generate fallback order ID
      orderId = `order_${Date.now()}_${validatedParams.orderNonce!.slice(0, 8)}`;
    }

    const response: SuccessResponse = {
      success: true,
      orderId,
      output: stdout
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('Order creation error:', e);
    return new Response(
      JSON.stringify(createErrorResponse(
        'INTERNAL_ERROR',
        'An unexpected error occurred. Please try again.',
        (e as Error).message
      )),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
