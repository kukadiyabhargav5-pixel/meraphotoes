import express from 'express';
import { submitGalleryVisitor, getEventsWithVisitorCounts, getEventVisitors } from '../controllers/visitorController';
import { authenticateJWT } from '../middlewares/auth';

const router = express.Router();

// Public route to submit visitor details
router.post('/event/code/:code', submitGalleryVisitor);

// Protected routes for studio owners
router.get('/events', authenticateJWT, getEventsWithVisitorCounts);
router.get('/event/:eventId', authenticateJWT, getEventVisitors);

export default router;

