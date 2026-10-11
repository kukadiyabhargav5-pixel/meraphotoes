import { Event, Media, FaceEmbedding, ShootLog, EventCover } from '../models';
import Customer from '../models/Customer';
import GalleryVisitor from '../models/GalleryVisitor';
import { deleteFile, deleteFiles } from './StorageService';
import { deleteEventPoints } from './qdrantService';

export const RETENTION_DAYS = 30;

/**
 * Accurately calculates elapsed days and days remaining out of 30 days
 * based strictly on the event's creation timestamp (createdAt).
 * 
 * - Day 0 (Day of creation): 30 days left
 * - Day 1: 29 days left
 * - ...
 * - Day 29: 1 day left ("last 1 day left")
 * - Day 30+ : 0 days left (expired -> purged on the following day)
 */
export const calculateEventDaysLeft = (event: any) => {
  let createdRaw = event?.createdAt;
  if (!createdRaw && event?._id && typeof event._id.getTimestamp === 'function') {
    createdRaw = event._id.getTimestamp();
  } else if (!createdRaw && event?._id && typeof event._id === 'string' && event._id.length === 24) {
    try {
      createdRaw = new Date(parseInt(event._id.substring(0, 8), 16) * 1000);
    } catch {
      // fallback
    }
  }

  const createdDate = createdRaw ? new Date(createdRaw) : new Date(event?.date || Date.now());
  const now = new Date();

  const createdMidnight = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate()).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Full calendar days elapsed since creation
  const diffDays = Math.max(0, Math.floor((todayMidnight - createdMidnight) / (1000 * 60 * 60 * 24)));
  const daysLeft = Math.max(0, RETENTION_DAYS - diffDays);
  const isExpired = diffDays >= RETENTION_DAYS;
  const autoDeleteAt = new Date(createdMidnight + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  return {
    diffDays,
    daysLeft,
    isExpired,
    autoDeleteAt,
    createdDate,
  };
};

/**
 * Permanently deletes an event and all its uploaded media from Cloudflare R2
 * and MongoDB, while strictly preserving Customer and GalleryVisitor records.
 */
export const purgeEventPermanently = async (eventOrId: any): Promise<boolean> => {
  try {
    let event: any = null;
    if (typeof eventOrId === 'string') {
      event = await Event.findById(eventOrId);
    } else if (eventOrId && eventOrId._id) {
      event = eventOrId;
    }

    if (!event) {
      return false;
    }

    const eventId = event._id.toString();
    console.log(`[EventRetention] Starting permanent purge for event "${event.name}" (${event.code || eventId})...`);

    // 1. Permanently preserve / update Customer record
    try {
      if (event.clientName) {
        const queryConditions: any[] = [];
        if (event.clientMobile) queryConditions.push({ phone: event.clientMobile });
        if (event.clientEmail) queryConditions.push({ email: event.clientEmail });

        let customer = null;
        if (queryConditions.length > 0) {
          customer = await Customer.findOne({
            studioId: event.studioId,
            $or: queryConditions,
          });
        }

        if (customer) {
          if (!customer.get('eventName')) (customer as any).eventName = event.name;
          if (!customer.get('eventDate')) (customer as any).eventDate = event.date;
          (customer as any).status = 'Completed';
          await customer.save();
        } else {
          await Customer.create({
            studioId: event.studioId,
            name: event.clientName,
            phone: event.clientMobile || '',
            email: event.clientEmail || '',
            eventName: event.name,
            eventDate: event.date,
            totalEvents: 1,
            status: 'Completed',
          });
        }
      }
    } catch (custErr) {
      console.error(`[EventRetention] Customer preservation error for event ${eventId}:`, custErr);
    }

    // 2. Permanently preserve GalleryVisitor records with full event context
    // Gallery visitor data is NEVER deleted. It is enriched with event info so the studio retains all visitor leads.
    try {
      await GalleryVisitor.updateMany(
        { eventId: event._id },
        {
          $set: {
            eventName: event.name,
            eventCode: event.code,
            eventDate: event.date,
            studioId: event.studioId,
          },
        }
      );
    } catch (visErr) {
      console.error(`[EventRetention] Visitor preservation error for event ${eventId}:`, visErr);
    }

    // 3. Collect and delete all media files permanently from Cloudflare R2
    try {
      const mediaList = await Media.find({ eventId: event._id });
      const storageKeysToDelete = new Set<string>();

      for (const media of mediaList) {
        if (media.r2Key) storageKeysToDelete.add(media.r2Key);
        if (media.compressedUrl && !media.compressedUrl.startsWith('data:') && !media.compressedUrl.startsWith('localdb:')) {
          storageKeysToDelete.add(media.compressedUrl);
        }
        if (media.thumbnailUrl && !media.thumbnailUrl.startsWith('data:') && !media.thumbnailUrl.startsWith('localdb:')) {
          storageKeysToDelete.add(media.thumbnailUrl);
        }
      }

      if (event.coverImageUrl && !event.coverImageUrl.startsWith('data:')) {
        storageKeysToDelete.add(event.coverImageUrl);
      }

      const keysArray = Array.from(storageKeysToDelete);
      if (keysArray.length > 0) {
        console.log(`[EventRetention] Deleting ${keysArray.length} file(s) from Cloudflare R2 for event ${eventId}...`);
        for (const key of keysArray) {
          await deleteFile(key).catch((err) =>
            console.warn(`[EventRetention] Failed to delete file ${key}:`, err?.message || err)
          );
        }
      }

      // Delete FaceEmbeddings
      const mediaIds = mediaList.map((m) => m._id);
      if (mediaIds.length > 0) {
        await FaceEmbedding.deleteMany({ mediaId: { $in: mediaIds } });
      }
      await FaceEmbedding.deleteMany({ eventId: event._id });

      // Delete Media documents
      await Media.deleteMany({ eventId: event._id });
    } catch (medErr) {
      console.error(`[EventRetention] Media purge error for event ${eventId}:`, medErr);
    }

    // 4. Delete vector points from Qdrant vector database
    try {
      await deleteEventPoints(eventId);
    } catch (qErr) {
      console.warn(`[EventRetention] Qdrant purge warning for event ${eventId}:`, qErr);
    }

    // 5. Delete ShootLog and EventCover
    try {
      await ShootLog.deleteMany({ eventId: event._id });
      await EventCover.deleteMany({ eventId: event._id });
    } catch (miscErr) {
      console.error(`[EventRetention] Misc logs purge error for event ${eventId}:`, miscErr);
    }

    // 6. Delete Event document from database
    await Event.findByIdAndDelete(event._id);
    console.log(`[EventRetention] Successfully purged 30-day expired event "${event.name}" (${event.code || eventId}) from cloud and database. Visitor data preserved.`);
    return true;
  } catch (err: any) {
    console.error(`[EventRetention] Error purging event:`, err);
    return false;
  }
};

/**
 * Automatically cleans up events and media that have completed 30 days from creation,
 * while permanently preserving customer records and gallery visitor data.
 */
export const cleanupExpiredEvents = async () => {
  try {
    const allEvents = await Event.find({});
    const expiredEvents = allEvents.filter((event) => {
      const { isExpired } = calculateEventDaysLeft(event);
      return isExpired;
    });

    if (!expiredEvents || expiredEvents.length === 0) {
      return { cleanedCount: 0 };
    }

    console.log(`[EventRetention] Found ${expiredEvents.length} event(s) older than 30 days. Purging event media while preserving customer & visitor data...`);

    let cleanedCount = 0;
    for (const event of expiredEvents) {
      const success = await purgeEventPermanently(event);
      if (success) cleanedCount++;
    }

    return { cleanedCount };
  } catch (err: any) {
    console.error('[EventRetention] Error in cleanupExpiredEvents:', err);
    return { error: err?.message || err };
  }
};

let retentionInterval: NodeJS.Timeout | null = null;

/**
 * Initializes the automated 30-day retention background schedule (runs hourly).
 */
export const startEventRetentionScheduler = () => {
  // Run once immediately on server startup
  cleanupExpiredEvents().catch((err) => console.error('[EventRetention] Initial run error:', err));

  // Run automatically every 1 hour
  if (!retentionInterval) {
    retentionInterval = setInterval(() => {
      cleanupExpiredEvents().catch((err) => console.error('[EventRetention] Scheduled run error:', err));
    }, 60 * 60 * 1000);
    console.log('[EventRetention] Automated 30-day event retention schedule initialized (runs hourly).');
  }
};
