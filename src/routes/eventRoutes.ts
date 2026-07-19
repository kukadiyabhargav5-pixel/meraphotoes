import { Router } from 'express';
import { createEvent, getMyEvents, getEventByCode, verifyEventPassword, getEventQRCode, updateEvent, requestEventOtp, verifyEventOtp, deleteEvent, updatePortfolioStatus } from '../controllers/eventController';
import { authenticateJWT, requireRoles } from '../middlewares/auth';

const router = Router();

// Studio routes
router.post('/', authenticateJWT, requireRoles(['STUDIO_OWNER', 'TEAM_MEMBER']), createEvent);
router.get('/my', authenticateJWT, requireRoles(['STUDIO_OWNER', 'TEAM_MEMBER']), getMyEvents);
router.put('/:eventId', authenticateJWT, requireRoles(['STUDIO_OWNER', 'TEAM_MEMBER']), updateEvent);
router.patch('/:eventId/portfolio-status', authenticateJWT, requireRoles(['STUDIO_OWNER', 'TEAM_MEMBER']), updatePortfolioStatus);
router.delete('/:eventId', authenticateJWT, requireRoles(['STUDIO_OWNER', 'TEAM_MEMBER']), deleteEvent);

// Public / Guest gallery routes
router.get('/code/:code', getEventByCode);
router.post('/code/:code/verify-password', verifyEventPassword);
router.post('/code/:code/request-otp', requestEventOtp);
router.post('/code/:code/verify-otp', verifyEventOtp);
router.get('/code/:code/qr', getEventQRCode);

export default router;
