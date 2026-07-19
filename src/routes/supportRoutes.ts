import { Router } from 'express';
import { createTicket, getMyTickets, replyToTicket, updateTicketStatus } from '../controllers/supportController';
import { authenticateJWT, requireRoles } from '../middlewares/auth';

const router = Router();

router.post('/ticket', authenticateJWT, createTicket);
router.get('/tickets', authenticateJWT, getMyTickets);
router.post('/ticket/:ticketId/reply', authenticateJWT, replyToTicket);

// Admin-only updates
router.put('/ticket/:ticketId/status', authenticateJWT, requireRoles(['SUPER_ADMIN']), updateTicketStatus);

export default router;
