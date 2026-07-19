import { Worker, Queue, Job } from 'bullmq';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import axios from 'axios';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';
import { redisConfig } from '../config/redis';
import { uploadFile } from '../services/StorageService';
import { Media, FaceEmbedding, Studio, Event } from '../models';

dotenv.config();

// ---- Redis availability check ----
export let isRedisAvailable = false;

const checkRedis = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: redisConfig.host, port: redisConfig.port });
    socket.setTimeout(800);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
  });
};

// Lazy queues & workers – only created when Redis is reachable
export let photoQueue: Queue | null = null;
export let videoQueue: Queue | null = null;

checkRedis().then((available) => {
  isRedisAvailable = available;
  if (available) {
    console.log('[MediaWorker] Redis is available – starting BullMQ queues & workers.');
    photoQueue = new Queue('photo-processing', { connection: redisConfig });
    videoQueue = new Queue('video-processing', { connection: redisConfig });
    initWorkers();
  } else {
    console.log('[MediaWorker] Redis is offline – BullMQ queues disabled. Uploads will process synchronously.');
  }
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * Downloads a file from a URL as a Buffer (e.g. for Studio Logos)
 */
const downloadUrlToBuffer = async (url: string): Promise<Buffer> => {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
};

/**
 * Helper to calculate watermark placement
 */
const getWatermarkPosition = (
  position: string,
  imgWidth: number,
  imgHeight: number,
  wWidth: number,
  wHeight: number
) => {
  const margin = 40;
  switch (position) {
    case 'TOP_LEFT':
      return { left: margin, top: margin };
    case 'TOP_RIGHT':
      return { left: imgWidth - wWidth - margin, top: margin };
    case 'BOTTOM_LEFT':
      return { left: margin, top: imgHeight - wHeight - margin };
    case 'CENTER':
      return { left: Math.round((imgWidth - wWidth) / 2), top: Math.round((imgHeight - wHeight) / 2) };
    case 'BOTTOM_RIGHT':
    default:
      return { left: imgWidth - wWidth - margin, top: imgHeight - wHeight - margin };
  }
};

/**
 * Applies studio's or event's watermark to a photo using Sharp.
 * Uses a fixed reference width (REFERENCE_WIDTH) so that the watermark
 * appears the same absolute size on every image, regardless of the
 * actual image dimensions.
 */
const REFERENCE_WIDTH = 1600; // All percentage calculations use this base

const applyWatermark = async (
  imageBuffer: Buffer,
  studioId: string,
  eventId?: string
): Promise<Buffer> => {
  let wmSettings: any = null;

  if (eventId) {
    const event = await Event.findById(eventId);
    if (event) {
      // If the event specifically has watermark disabled, DO NOT apply any watermark
      if (!event.watermark?.isActive) {
        return imageBuffer;
      }
      
      const wmType = event.watermark.type || 'LOGO';
      if (wmType === 'LOGO' && event.watermark.logoUrl) {
        wmSettings = {
          type: 'LOGO',
          logoUrl: event.watermark.logoUrl,
          position: event.watermark.position,
          opacity: event.watermark.opacity,
          widthPercentage: event.watermark.width,
          heightPercentage: event.watermark.height,
        };
      } else if (wmType === 'TEXT' && event.watermark.text) {
        wmSettings = {
          type: 'TEXT',
          text: event.watermark.text,
          position: event.watermark.position,
          opacity: event.watermark.opacity,
          widthPercentage: event.watermark.width,
          heightPercentage: event.watermark.height,
        };
      }
    }
  }

  if (!wmSettings) {
    const studio = await Studio.findById(studioId);
    if (!studio || !studio.watermark || studio.watermark.type === 'NONE') {
      return imageBuffer;
    }
    wmSettings = {
      type: studio.watermark.type,
      text: studio.watermark.text,
      logoUrl: studio.watermark.logoUrl,
      position: studio.watermark.position,
      opacity: studio.watermark.opacity,
      widthPercentage: 18, // Legacy studio default
      heightPercentage: null,
    };
  }

  const { type, text, logoUrl, position, opacity, widthPercentage, heightPercentage } = wmSettings;
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 800;

  if (type === 'TEXT' && text) {
    // Size relative to image width so it scales identically in masonry columns
    const fontSize = Math.round(width * 0.035);
    const margin = Math.round(width * 0.02); // 2% margin

    // Calculate text position based on the position setting
    let textX: string;
    let textY: string;
    let textAnchor: string;
    let dominantBaseline: string;

    switch (position) {
      case 'TOP_LEFT':
        textX = `${margin}`;
        textY = `${margin + fontSize}`;
        textAnchor = 'start';
        dominantBaseline = 'auto';
        break;
      case 'TOP_RIGHT':
        textX = `${width - margin}`;
        textY = `${margin + fontSize}`;
        textAnchor = 'end';
        dominantBaseline = 'auto';
        break;
      case 'BOTTOM_LEFT':
        textX = `${margin}`;
        textY = `${height - margin}`;
        textAnchor = 'start';
        dominantBaseline = 'auto';
        break;
      case 'BOTTOM_RIGHT':
        textX = `${width - margin}`;
        textY = `${height - margin}`;
        textAnchor = 'end';
        dominantBaseline = 'auto';
        break;
      case 'CENTER':
      default:
        textX = '50%';
        textY = '50%';
        textAnchor = 'middle';
        dominantBaseline = 'middle';
        break;
    }

    const svgText = `
      <svg width="${width}" height="${height}">
        <style>
          .watermark-text {
            fill: #ffffff;
            font-size: ${fontSize}px;
            font-family: Arial, sans-serif;
            font-weight: bold;
            opacity: ${opacity};
          }
        </style>
        <text x="${textX}" y="${textY}" class="watermark-text" text-anchor="${textAnchor}" dominant-baseline="${dominantBaseline}">${text}</text>
      </svg>
    `;
    return sharp(imageBuffer)
      .composite([{ input: Buffer.from(svgText), top: 0, left: 0 }])
      .toBuffer();
  } else if (type === 'LOGO' && logoUrl) {
    try {
      const logoBuffer = await downloadUrlToBuffer(logoUrl);
      // Size relative to image width
      const logoResizedWidth = Math.round(width * (widthPercentage / 100));
      
      let sharpLogo = sharp(logoBuffer);
      if (heightPercentage) {
        const refHeight = Math.round(width * 0.75); // Assume ~4:3 reference relative to width
        const logoResizedHeight = Math.round(refHeight * (heightPercentage / 100));
        sharpLogo = sharpLogo.resize({ width: logoResizedWidth, height: logoResizedHeight, fit: 'fill' });
      } else {
        sharpLogo = sharpLogo.resize({ width: logoResizedWidth });
      }

      // Convert to PNG buffer first so we can wrap it in SVG for opacity
      const resizedLogoBuffer = await sharpLogo.png().toBuffer();
      const logoMeta = await sharp(resizedLogoBuffer).metadata();
      const logoW = logoMeta.width || logoResizedWidth;
      const logoH = logoMeta.height || 100;

      // Apply opacity using an SVG wrapper
      const svgWrapper = `
        <svg width="${logoW}" height="${logoH}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
          <image xlink:href="data:image/png;base64,${resizedLogoBuffer.toString('base64')}" width="${logoW}" height="${logoH}" opacity="${opacity}" />
        </svg>
      `;

      const finalLogoBuffer = await sharp(Buffer.from(svgWrapper)).png().toBuffer();

      const pos = getWatermarkPosition(position, width, height, logoW, logoH);

      return sharp(imageBuffer)
        .composite([{ input: finalLogoBuffer, top: pos.top, left: pos.left }])
        .toBuffer();
    } catch (err) {
      console.error('Error applying logo watermark, saving unwatermarked image:', err);
      return imageBuffer;
    }
  }

  return imageBuffer;
};

// Refactored async process methods so they can be called directly
export const processPhoto = async (mediaId: string, studioId: string) => {
  const media = await Media.findById(mediaId);
  if (!media) throw new Error('Media document not found');

  await Media.findByIdAndUpdate(mediaId, { processedStatus: 'PROCESSING' });

  try {
    const originalBuffer = await downloadUrlToBuffer(media.r2Url);
    const metadata = await sharp(originalBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    let galleryImage = await sharp(originalBuffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 95 })
      .toBuffer();

    galleryImage = await applyWatermark(galleryImage, studioId, media.eventId.toString());

    const folderForCloudinary = `events/${media.eventId}/photos/gallery`;
    const { url: compressedUrl } = await uploadFile(galleryImage, folderForCloudinary);

    const thumbnailImage = await sharp(originalBuffer)
      .rotate()
      .resize({ width: 400 })
      .jpeg({ quality: 75 })
      .toBuffer();

    const thumbFolder = `events/${media.eventId}/photos/thumb`;
    const { url: thumbnailUrl } = await uploadFile(thumbnailImage, thumbFolder);

    const formData = new FormData();
    // Send the high-res 1600px gallery image to AI service to detect tiny faces in group photos
    const fileBlob = new Blob([new Uint8Array(galleryImage)], { type: 'image/jpeg' });
    formData.append('file', fileBlob, 'image.jpg');

    let faces = [];
    try {
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/detect-faces`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      faces = aiResponse.data.faces || [];
    } catch (aiErr: any) {
      console.warn(`[AI Warning]: AI Face Service offline. Skipping face detection for photo ${mediaId}:`, aiErr.message);
    }
    console.log(`Detected ${faces.length} faces in photo ${mediaId}`);

    for (const face of faces) {
      await FaceEmbedding.create({
        mediaId: media._id,
        eventId: media.eventId,
        studioId: media.studioId,
        embedding: face.embedding,
        bbox: face.bbox,
        faceThumbnailUrl: `data:image/jpeg;base64,${face.thumbnail}`,
      });
    }

    await Media.findByIdAndUpdate(mediaId, {
      processedStatus: 'COMPLETED',
      thumbnailUrl,
      compressedUrl,
      width,
      height,
    });

    await Studio.findByIdAndUpdate(studioId, { $inc: { 'usage.photosUploaded': 1 } });
  } catch (err: any) {
    console.error(`Failed to process photo ${mediaId}:`, err);
    await Media.findByIdAndUpdate(mediaId, { processedStatus: 'FAILED' });
    throw err;
  }
};

export const processVideo = async (mediaId: string, studioId: string) => {
  const media = await Media.findById(mediaId);
  if (!media) throw new Error('Media document not found');

  await Media.findByIdAndUpdate(mediaId, { processedStatus: 'PROCESSING' });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-proc-'));
  const tempVideoPath = path.join(tempDir, `video_${mediaId}.mp4`);
  const framesDir = path.join(tempDir, 'frames');
  fs.mkdirSync(framesDir);

  try {
    const originalBuffer = await downloadUrlToBuffer(media.r2Url);
    fs.writeFileSync(tempVideoPath, originalBuffer);

    const duration: number = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(tempVideoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .outputOptions([
          '-vf', 'fps=1/2',
          '-vsync', 'vfr',
        ])
        .output(path.join(framesDir, 'frame-%03d.jpg'))
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const frameFiles = fs.readdirSync(framesDir).sort();
    console.log(`Extracted ${frameFiles.length} frames from video ${mediaId}`);

    for (let i = 0; i < frameFiles.length; i++) {
      const frameFile = frameFiles[i];
      const framePath = path.join(framesDir, frameFile);
      const timestamp = i * 2 + 1;

      const frameBuffer = fs.readFileSync(framePath);

      const formData = new FormData();
      const fileBlob = new Blob([new Uint8Array(frameBuffer)], { type: 'image/jpeg' });
      formData.append('file', fileBlob, 'frame.jpg');

      try {
        const aiResponse = await axios.post(`${AI_SERVICE_URL}/detect-faces`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const faces = aiResponse.data.faces || [];
        for (const face of faces) {
          await FaceEmbedding.create({
            mediaId: media._id,
            eventId: media.eventId,
            studioId: media.studioId,
            embedding: face.embedding,
            bbox: face.bbox,
            faceThumbnailUrl: `data:image/jpeg;base64,${face.thumbnail}`,
            timestamp,
          });
        }
      } catch (aiErr) {
        console.error(`Error processing frame ${frameFile} at timestamp ${timestamp}:`, aiErr);
      }
    }

    const thumbFolder = `events/${media.eventId}/videos/thumb`;
    const tempThumbPath = path.join(tempDir, 'vid_thumb.jpg');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .screenshots({
          timestamps: [Math.min(2, duration / 2)],
          folder: tempDir,
          filename: 'vid_thumb.jpg',
          size: '400x?',
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    let thumbnailUrl = '';
    if (fs.existsSync(tempThumbPath)) {
      const thumbBuffer = fs.readFileSync(tempThumbPath);
      const { url } = await uploadFile(thumbBuffer, thumbFolder);
      thumbnailUrl = url;
    }

    await Media.findByIdAndUpdate(mediaId, {
      processedStatus: 'COMPLETED',
      thumbnailUrl,
      compressedUrl: media.r2Url,
      duration,
    });

    await Studio.findByIdAndUpdate(studioId, { $inc: { 'usage.videosUploaded': 1 } });
  } catch (err: any) {
    console.error(`Failed to process video ${mediaId}:`, err);
    await Media.findByIdAndUpdate(mediaId, { processedStatus: 'FAILED' });
    throw err;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error('Error cleaning up temp directory:', cleanupErr);
    }
  }
};

export const processMediaLocal = async (mediaId: string, type: 'PHOTO' | 'VIDEO', studioId: string) => {
  if (type === 'PHOTO') {
    await processPhoto(mediaId, studioId);
  } else {
    await processVideo(mediaId, studioId);
  }
};

// Initialize BullMQ workers only when Redis is available
function initWorkers() {
  const photoWorker = new Worker(
    'photo-processing',
    async (job: Job) => {
      const { mediaId, studioId } = job.data;
      await processPhoto(mediaId, studioId);
    },
    { connection: redisConfig }
  );

  const videoWorker = new Worker(
    'video-processing',
    async (job: Job) => {
      const { mediaId, studioId } = job.data;
      await processVideo(mediaId, studioId);
    },
    { connection: redisConfig }
  );

  photoQueue!.on('error', (err) => console.warn('BullMQ photoQueue warning:', err.message));
  videoQueue!.on('error', (err) => console.warn('BullMQ videoQueue warning:', err.message));
  photoWorker.on('error', (err) => console.warn('BullMQ photoWorker warning:', err.message));
  videoWorker.on('error', (err) => console.warn('BullMQ videoWorker warning:', err.message));
}
