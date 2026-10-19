import { Router } from 'express';
import { getMyStudio, updateMyStudio, getStudioCredits, updateStudioPlan, uploadStudioLogo, deleteStudioLogo } from '../controllers/studioController';
import { authenticateJWT } from '../middlewares/auth';
import { upload } from '../middlewares/upload';

const router = Router();

router.get('/me', authenticateJWT, getMyStudio);
router.get('/credits', authenticateJWT, getStudioCredits);
router.put('/me', authenticateJWT, updateMyStudio);
router.post('/logo', authenticateJWT, upload.any(), uploadStudioLogo);
router.delete('/logo', authenticateJWT, deleteStudioLogo);
router.post('/plan', authenticateJWT, updateStudioPlan);

export default router;
