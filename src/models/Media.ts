import mongoose, { Schema, Document } from 'mongoose';

export interface IMedia extends Document {
  type: 'PHOTO' | 'VIDEO';
  r2Key: string;
  r2Url: string;
  thumbnailUrl?: string; // used for quick gallery grid previews
  compressedUrl?: string; // compressed version (with or without watermark)
  folderPath?: string; // Stores the original relative folder path
  eventId: mongoose.Types.ObjectId;
  studioId: mongoose.Types.ObjectId;
  size: number; // in bytes
  width?: number;
  height?: number;
  duration?: number; // in seconds (for videos)
  uploadedBy: mongoose.Types.ObjectId;
  processedStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
}

const MediaSchema = new Schema<IMedia>({
  type: { type: String, enum: ['PHOTO', 'VIDEO'], required: true },
  r2Key: { type: String, required: true },
  r2Url: { type: String, required: true },
  thumbnailUrl: { type: String },
  compressedUrl: { type: String },
  folderPath: { type: String, default: '' },
  eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  studioId: { type: Schema.Types.ObjectId, ref: 'Studio', required: true, index: true },
  size: { type: Number, required: true },
  width: { type: Number },
  height: { type: Number },
  duration: { type: Number },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  processedStatus: { 
    type: String, 
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], 
    default: 'PENDING' 
  }
}, {
  timestamps: true
});

export const Media = mongoose.model<IMedia>('Media', MediaSchema);
