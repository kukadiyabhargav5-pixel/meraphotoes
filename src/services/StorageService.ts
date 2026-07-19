import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

// Cloudinary will automatically pick up CLOUDINARY_URL from the environment variables
cloudinary.config({
  secure: true,
});

/**
 * Uploads a buffer directly to Cloudinary
 * Returns the secure URL and the public_id
 */
export const uploadFile = async (
  fileBuffer: Buffer,
  folder: string = 'mara-photo'
): Promise<{ url: string; publicId: string }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto', // Automatically detect image or video
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary Upload Error:', error);
          return reject(error);
        }
        if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      }
    );

    const readableStream = new Readable();
    readableStream._read = () => {}; // _read is required but you can noop it
    readableStream.push(fileBuffer);
    readableStream.push(null);

    readableStream.pipe(uploadStream);
  });
};

/**
 * Deletes a file from Cloudinary given its publicId
 */
export const deleteFile = async (publicId: string): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error(`Failed to delete Cloudinary file: ${publicId}`, error);
  }
};

/**
 * Generate Cloudinary signature for client-side uploads
 */
export const generateSignature = (folder: string) => {
  const timestamp = Math.round((new Date).getTime()/1000);
  const paramsToSign = {
    timestamp,
    folder
  };
  const apiSecret = cloudinary.config().api_secret;
  if (!apiSecret) throw new Error('Cloudinary API secret not configured');
  
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
  
  return {
    timestamp,
    signature,
    cloudName: cloudinary.config().cloud_name,
    apiKey: cloudinary.config().api_key,
    folder
  };
};
