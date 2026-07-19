import { Router } from 'express';
import { createBillingSession, cancelMySubscription, handleRazorpayWebhook } from '../controllers/paymentController';
import { authenticateJWT } from '../middlewares/auth';

const router = Router();

router.post('/checkout', authenticateJWT, createBillingSession);
router.post('/cancel', authenticateJWT, cancelMySubscription);

// Webhook endpoint (Public, signature-verified inside controller)
router.post('/webhook', handleRazorpayWebhook);

export default router;
