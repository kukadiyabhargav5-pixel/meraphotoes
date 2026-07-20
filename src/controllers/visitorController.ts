import { Request, Response } from 'express';
import GalleryVisitor from '../models/GalleryVisitor';
import { Event } from '../models/Event';
import { Studio } from '../models/Studio';
import { AuthRequest } from '../middlewares/auth';

/**
 * Submit gallery visitor details
 */
export const submitGalleryVisitor = async (req: Request, res: Response) => {
  const { code } = req.params;
  const { name, phone, email } = req.body;

  try {
    const event = await Event.findOne({ code });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const visitor = new GalleryVisitor({
      eventId: event._id,
      studioId: event.studioId,
      name,
      phone,
      email
    });

    await visitor.save();

    return res.status(201).json({ message: 'Visitor details saved successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Get all events with visitor counts for the studio
 */
export const getEventsWithVisitorCounts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const studio = await Studio.findOne({ ownerId: req.user._id });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    // Aggregate to get events and their visitor counts
    const visitorStats = await GalleryVisitor.aggregate([
      { $match: { studioId: studio._id } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } }
    ]);

    const visitorCountsMap = visitorStats.reduce((acc: any, curr: any) => {
      acc[curr._id.toString()] = curr.count;
      return acc;
    }, {});

    // Get all events for the studio
    const events = await Event.find({ studioId: studio._id }).sort({ date: -1 });

    const eventsWithCounts = events.map(event => {
      const eventObj = event.toObject();
      return {
        ...eventObj,
        visitorCount: visitorCountsMap[event._id.toString()] || 0
      };
    });

    return res.json({ events: eventsWithCounts });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Get visitors for a specific event
 */
export const getEventVisitors = async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params;

  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const studio = await Studio.findOne({ ownerId: req.user._id });
    if (!studio) return res.status(404).json({ error: 'Studio not found' });

    const visitors = await GalleryVisitor.find({ 
      eventId, 
      studioId: studio._id 
    }).sort({ createdAt: -1 });

    return res.json({ visitors });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
