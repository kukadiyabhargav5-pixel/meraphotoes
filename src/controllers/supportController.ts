import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { SupportTicket } from '../models';

/**
 * Creates a support ticket
 */
export const createTicket = async (req: AuthRequest, res: Response) => {
  const { subject, message } = req.body;

  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    const { Studio } = await import('../models');
    const studio = await Studio.findOne({ ownerId: req.user._id });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    const newTicket = await SupportTicket.create({
      studioId: studio._id,
      name: req.user.name,
      email: req.user.email,
      subject,
      status: 'OPEN',
      messages: [
        {
          sender: 'STUDIO',
          message,
          timestamp: new Date(),
        },
      ],
    });

    return res.status(201).json({ message: 'Support ticket opened successfully', ticket: newTicket });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * List support tickets opened by the studio owner
 */
export const getMyTickets = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { Studio } = await import('../models');
    const studio = await Studio.findOne({ ownerId: req.user._id });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    const tickets = await SupportTicket.find({ studioId: studio._id }).sort({ updatedAt: -1 });
    return res.json({ tickets });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Adds a reply message to a support ticket
 */
export const replyToTicket = async (req: AuthRequest, res: Response) => {
  const { ticketId } = req.params;
  const { message } = req.body;

  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!message) return res.status(400).json({ error: 'Message content is required' });

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ error: 'Support ticket not found' });

    const senderRole = req.user.role === 'SUPER_ADMIN' ? 'ADMIN' : 'STUDIO';

    ticket.messages.push({
      sender: senderRole,
      message,
      timestamp: new Date(),
    });
    
    // If studio owner responds, set status back to OPEN
    if (senderRole === 'STUDIO') {
      ticket.status = 'OPEN';
    }

    await ticket.save();
    return res.json({ message: 'Reply sent successfully', ticket });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * SUPER ADMIN endpoint to resolve support tickets
 */
export const updateTicketStatus = async (req: AuthRequest, res: Response) => {
  const { ticketId } = req.params;
  const { status } = req.body; // 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!status || !['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status parameter' });
    }

    const ticket = await SupportTicket.findByIdAndUpdate(ticketId, { status }, { new: true });
    if (!ticket) return res.status(404).json({ error: 'Support ticket not found' });

    return res.json({ message: 'Ticket status updated successfully', ticket });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
