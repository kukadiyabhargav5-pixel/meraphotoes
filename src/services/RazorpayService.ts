import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { PricingPlan } from '../models/PricingPlan';

dotenv.config();

/**
 * SECURITY: Razorpay credentials MUST come from environment variables.
 * Never hardcode keys or secrets. The app will fail loudly if they're missing.
 */
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error(
    '[Razorpay] WARNING: RAZORPAY_KEY_ID and/or RAZORPAY_KEY_SECRET are not set. ' +
    'Payment features will NOT work. Set these in your .env file.'
  );
}

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID || 'MISSING_KEY_ID',
  key_secret: RAZORPAY_KEY_SECRET || 'MISSING_KEY_SECRET',
});

/**
 * Retrieves the authoritative price for a plan from the database.
 * Falls back to a static map ONLY as a safety net.
 * The database (PricingPlan model) is the single source of truth.
 */
const FALLBACK_PLAN_PRICES: Record<string, number> = {
  BASIC: 0,
  STARTUP: 3999,
  STANDARD: 7999,
  ESSENTIAL: 12999,
  PREMIUM: 19999,
};

/**
 * Gets the authoritative price for a plan key from the database.
 * Returns the price in INR (rupees).
 */
export const getAuthoritativePlanPrice = async (planKey: string): Promise<number | null> => {
  try {
    const plan = await PricingPlan.findOne({ 
      planKey: planKey.toUpperCase(), 
      isActive: true 
    });
    if (plan) {
      return plan.priceInr;
    }
  } catch (err) {
    console.warn('[Razorpay] Could not fetch plan from DB, using fallback:', err);
  }
  // Fallback to static prices only if DB lookup fails
  const fallback = FALLBACK_PLAN_PRICES[planKey.toUpperCase()];
  return fallback !== undefined ? fallback : null;
};

/**
 * Gets the tax rate for a plan key from the database.
 */
export const getAuthoritativeTaxRate = async (planKey: string): Promise<number> => {
  try {
    const plan = await PricingPlan.findOne({ 
      planKey: planKey.toUpperCase(), 
      isActive: true 
    });
    if (plan) {
      return plan.taxRate;
    }
  } catch (err) {
    // fallback
  }
  return planKey.toUpperCase() === 'BASIC' ? 0 : 0.18;
};

// Legacy export for backward compat — prefer getAuthoritativePlanPrice()
export const PLAN_PRICES: Record<string, number> = FALLBACK_PLAN_PRICES;

/**
 * Creates a generic Razorpay Order for any server-verified amount.
 * Amount is in Rupees — conversion to paise happens here.
 */
export const createRazorpayOrder = async (
  amountInRupees: number, 
  receiptId: string, 
  notes: Record<string, any> = {}
) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  const amountInPaise = Math.round(amountInRupees * 100);
  if (amountInPaise <= 0) {
    throw new Error('Order amount must be greater than zero');
  }
  return razorpay.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: receiptId,
    notes,
  });
};

/**
 * Creates a one-time order inside Razorpay for a studio plan.
 * Fetches the price from the database (single source of truth).
 */
export const createOrder = async (planKey: string, receiptId: string) => {
  const price = await getAuthoritativePlanPrice(planKey);
  if (price === null) {
    throw new Error(`Unknown plan key: ${planKey}`);
  }
  if (price === 0) {
    throw new Error('Cannot create a payment order for a free plan');
  }
  return createRazorpayOrder(price, receiptId, { planKey });
};

/**
 * Securely verifies payment signature returned by Razorpay Checkout.
 * SECURITY: Uses RAZORPAY_KEY_SECRET from env — never hardcoded.
 */
export const verifyPaymentSignature = (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean => {
  if (!RAZORPAY_KEY_SECRET) {
    console.error('[Razorpay] Cannot verify signature: RAZORPAY_KEY_SECRET not set');
    return false;
  }
  const data = `${razorpayOrderId}|${razorpayPaymentId}`;
  const generatedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(data)
    .digest('hex');
  return generatedSignature === razorpaySignature;
};

/**
 * Cancels an active Razorpay subscription.
 * Currently returns true as we use one-time orders, not recurring subscriptions.
 */
export const cancelSubscription = async (subscriptionId: string) => {
  // When recurring subscriptions are implemented, call razorpay.subscriptions.cancel here
  return true;
};

/**
 * Verifies the integrity of webhook callbacks from Razorpay.
 * SECURITY: Uses RAZORPAY_WEBHOOK_SECRET from env — never hardcoded.
 */
export const verifyWebhookSignature = (rawBody: string, signature: string): boolean => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Razorpay] Cannot verify webhook: RAZORPAY_WEBHOOK_SECRET not set');
    return false;
  }
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  return expectedSignature === signature;
};

/**
 * Returns the Razorpay key ID for client-side checkout.
 * SECURITY: Only the key_id (public) is returned — never the secret.
 */
export const getPublicKeyId = (): string => {
  return RAZORPAY_KEY_ID || '';
};

export { razorpay };
