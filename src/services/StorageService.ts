import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// Cloudflare R2 S3 Client Initialization
export const r2Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT || '',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME || 'maraphoto';

/**
 * Returns the public or stream URL for a given R2 object key.
 * If R2_PUBLIC_URL (e.g. https://pub-xxx.r2.dev or custom CDN domain) is configured,
 * returns the direct CDN URL.
 * Otherwise, returns the backend high-performance media stream URL.
 */
export const getFileUrl = (key: string): string => {
  if (!key) return '';
  // If key is already a full URL, return it
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }
  const cleanKey = key.replace(/^\/+/, '');
  if (process.env.R2_PUBLIC_URL) {
    const publicBase = process.env.R2_PUBLIC_URL.replace(/\/+$/, '');
    return `${publicBase}/${cleanKey}`;
  }
  const apiBase = (process.env.API_URL || 'http://localhost:5000').replace(/\/+$/, '');
  return `${apiBase}/api/media/file/${cleanKey}`;
};

/**
 * Uploads a buffer directly to Cloudflare R2 with high performance.
 * Returns the public access/stream URL and the R2 storage key (publicId).
 */
export const uploadFile = async (
  fileBuffer: Buffer,
  folder: string = 'mara-photo',
  contentType: string = 'image/jpeg',
  fileName?: string
): Promise<{ url: string; publicId: string }> => {
  try {
    const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
    let safeName: string;

    if (fileName) {
      safeName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    } else {
      const ext = contentType.includes('png')
        ? '.png'
        : contentType.includes('webp')
        ? '.webp'
        : contentType.includes('video') || contentType.includes('mp4')
        ? '.mp4'
        : '.jpg';
      safeName = `${Date.now()}_${uuidv4().slice(0, 8)}${ext}`;
    }

    const key = cleanFolder ? `${cleanFolder}/${safeName}` : safeName;

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    return {
      url: getFileUrl(key),
      publicId: key,
    };
  } catch (error) {
    console.error('[StorageService] R2 Upload Error:', error);
    throw error;
  }
};

/**
 * Deletes a file from Cloudflare R2 given its storage key or publicId.
 */
export const deleteFile = async (keyOrId: string): Promise<void> => {
  try {
    if (!keyOrId) return;
    // Strip public URL prefix if a full URL was provided
    let key = keyOrId;
    if (key.includes('/api/media/file/')) {
      key = key.split('/api/media/file/')[1];
    } else if (process.env.R2_PUBLIC_URL && key.includes(process.env.R2_PUBLIC_URL)) {
      key = key.replace(process.env.R2_PUBLIC_URL.replace(/\/+$/, '') + '/', '');
    }

    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      })
    );
  } catch (error) {
    console.error(`[StorageService] Failed to delete R2 file: ${keyOrId}`, error);
  }
};

/**
 * Bulk deletes multiple files from Cloudflare R2 in chunks of 1000.
 */
export const deleteFiles = async (keys: string[]): Promise<void> => {
  try {
    const validKeys = keys.filter(Boolean);
    if (validKeys.length === 0) return;

    for (let i = 0; i < validKeys.length; i += 1000) {
      const chunk = validKeys.slice(i, i + 1000);
      await r2Client.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: chunk.map((Key) => ({ Key })) },
        })
      );
    }
  } catch (error) {
    console.error('[StorageService] Bulk Delete Error:', error);
  }
};

/**
 * Directly downloads an object from Cloudflare R2 as a Buffer.
 * High-speed internal transfer for video/photo processing workers.
 */
export const getFileBuffer = async (key: string): Promise<Buffer> => {
  try {
    let cleanKey = key;
    if (cleanKey.includes('/api/media/file/')) {
      cleanKey = cleanKey.split('/api/media/file/')[1];
    } else if (process.env.R2_PUBLIC_URL && cleanKey.includes(process.env.R2_PUBLIC_URL)) {
      cleanKey = cleanKey.replace(process.env.R2_PUBLIC_URL.replace(/\/+$/, '') + '/', '');
    }

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: cleanKey,
    });
    const res = await r2Client.send(command);
    const byteArray = await (res.Body as any).transformToByteArray();
    return Buffer.from(byteArray);
  } catch (error) {
    console.error(`[StorageService] Failed to fetch buffer for key ${key}:`, error);
    throw error;
  }
};

/**
 * Generates a presigned PUT URL for direct client-to-R2 high-speed upload.
 */
export const generatePresignedUploadUrl = async (
  key: string,
  contentType: string = 'image/jpeg',
  expiresInSeconds: number = 3600
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
};

/**
 * Generates a presigned GET URL for secure, direct downloads from Cloudflare R2.
 */
export const generatePresignedDownloadUrl = async (
  key: string,
  downloadFilename?: string,
  expiresInSeconds: number = 3600
): Promise<string> => {
  let cleanKey = key;
  if (cleanKey.includes('/api/media/file/')) {
    cleanKey = cleanKey.split('/api/media/file/')[1];
  } else if (process.env.R2_PUBLIC_URL && cleanKey.includes(process.env.R2_PUBLIC_URL)) {
    cleanKey = cleanKey.replace(process.env.R2_PUBLIC_URL.replace(/\/+$/, '') + '/', '');
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: cleanKey,
    ResponseContentDisposition: downloadFilename
      ? `attachment; filename="${encodeURIComponent(downloadFilename)}"`
      : undefined,
  });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
};

/**
 * Backwards compatibility helper for previous client auth requests.
 */
export const generateSignature = () => {
  return {
    token: uuidv4(),
    expire: Math.floor(Date.now() / 1000) + 3600,
    signature: 'r2_authenticated',
  };
};
