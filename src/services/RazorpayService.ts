import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret',
});

/**
 * Maps subscription tiers to Razorpay Plan IDs
 */
export const PLAN_IDS = {
  STARTER: 'plan_starter_id',
  PROFESSIONAL: 'plan_professional_id',
  BUSINESS: 'plan_business_id',
  ENTERPRISE: 'plan_enterprise_id',
};

/**
 * Creates a subscription inside Razorpay for a studio
 */
export const createSubscription = async (planKey: keyof typeof PLAN_IDS) => {
  const planId = PLAN_IDS[planKey];
  return razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1, // notify customer directly via Razorpay
    total_count: 12, // 1 year of monthly iterations (can adapt for recurring billing)
    quantity: 1,
  });
};

/**
 * Cancels an active Razorpay subscription at the end of the current billing cycle
 */
export const cancelSubscription = async (subscriptionId: string) => {
  return razorpay.subscriptions.cancel(subscriptionId, true);
};

/**
 * Verifies the integrity of webhook callbacks from Razorpay
 */
export const verifyWebhookSignature = (rawBody: string, signature: string): boolean => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expectedSignature === signature;
};

export { razorpay };
