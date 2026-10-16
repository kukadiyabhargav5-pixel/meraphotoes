import { Router } from 'express';
import {
  getActivePlans,
  getPlanByKey,
} from '../controllers/pricingController';

const router = Router();

// Public endpoints — no auth required
router.get('/', getActivePlans);
router.get('/:planKey', getPlanByKey);

export default router;
