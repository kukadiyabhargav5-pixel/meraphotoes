import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret',
});

export const PLAN_PRICES = {
  BASIC: 0,
  STANDARD: 4900,
  ESSENTIAL: 14900,
  PREMIUM: 31900,
};

/**
 * Creates a one-time order inside Razorpay for a studio plan
 */
export const createOrder = async (planKey: keyof typeof PLAN_PRICES, receiptId: string) => {
  const amount = PLAN_PRICES[planKey];
  return razorpay.orders.create({
    amount: amount * 100, // in paise
    currency: 'INR',
    receipt: receiptId,
  });
};

/**
 * Cancels an active Razorpay subscription (mocked since we use one-time orders now)
 */
export const cancelSubscription = async (subscriptionId: string) => {
  return true;
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
