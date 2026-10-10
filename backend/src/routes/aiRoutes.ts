import { Router } from 'express';
import { searchBySelfie } from '../controllers/aiController';
import { upload } from '../middlewares/upload';

const router = Router();

// Upload a selfie and search for matching faces within an event
router.post('/search/:eventId', upload.single('selfie'), searchBySelfie);

export default router;
