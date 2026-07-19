import mongoose, { Schema, Document } from 'mongoose';

export interface IWatermarkSettings {
  type: 'TEXT' | 'LOGO' | 'NONE';
  text?: string;
  logoUrl?: string;
  position: 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT' | 'CENTER';
  opacity: number; // 0 to 1
  size: number; // 10 to 100 percentage
}

export interface IUsageLimit {
  photosUploaded: number;
  videosUploaded: number;
  aiSearchesCount: number;
}

export interface IPaymentDetails {
  upiId?: string;
  merchantName?: string;
  uploadedQrUrl?: string;
}

export interface IStudio extends Document {
  name: string;
  logoUrl?: string;
  subdomain: string; // unique subdomain, e.g. "dreamstudio"
  customDomain?: string; // e.g. "gallery.dreamstudio.com"
  ownerId: mongoose.Types.ObjectId;
  watermark: IWatermarkSettings;
  subscriptionPlan: 'BASIC' | 'STANDARD' | 'ESSENTIAL' | 'PREMIUM' | 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';
  subscriptionStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIALING' | 'FREE';
  razorpaySubscriptionId?: string;
  paymentDetails?: IPaymentDetails;
  usage: IUsageLimit;
  createdAt: Date;
  updatedAt: Date;
}

const StudioSchema = new Schema<IStudio>({
  name: { type: String, required: true },
  logoUrl: { type: String },
  subdomain: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  customDomain: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  watermark: {
    type: { type: String, enum: ['TEXT', 'LOGO', 'NONE'], default: 'NONE' },
    text: { type: String, default: 'Mara Photo' },
    logoUrl: { type: String },
    position: { 
      type: String, 
      enum: ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT', 'CENTER'], 
      default: 'BOTTOM_RIGHT' 
    },
    opacity: { type: Number, default: 0.5, min: 0, max: 1 },
    size: { type: Number, default: 20, min: 10, max: 100 }
  },
  subscriptionPlan: { 
    type: String, 
    enum: ['BASIC', 'STANDARD', 'ESSENTIAL', 'PREMIUM', 'STARTER', 'PROFESSIONAL', 'BUSINESS', 'ENTERPRISE'], 
    default: 'BASIC' 
  },
  subscriptionStatus: { 
    type: String, 
    enum: ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIALING', 'FREE'], 
    default: 'ACTIVE' 
  },
  razorpaySubscriptionId: { type: String },
  paymentDetails: {
    upiId: { type: String },
    merchantName: { type: String },
    uploadedQrUrl: { type: String }
  },
  usage: {
    photosUploaded: { type: Number, default: 0 },
    videosUploaded: { type: Number, default: 0 },
    aiSearchesCount: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

export const Studio = mongoose.model<IStudio>('Studio', StudioSchema);
