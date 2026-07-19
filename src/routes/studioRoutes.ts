import { Router } from 'express';
import { getMyStudio, updateMyStudio } from '../controllers/studioController';
import { authenticateJWT } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticateJWT, getMyStudio);
router.put('/me', authenticateJWT, updateMyStudio);

export default router;
