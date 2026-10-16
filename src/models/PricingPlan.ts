import mongoose, { Schema, Document } from 'mongoose';

export interface IPlanFeature {
  text: string;
  included: boolean;
}

export interface IPricingPlan extends Document {
  planKey: string;           // e.g. BASIC, STARTUP, STANDARD, ESSENTIAL, PREMIUM
  name: string;              // Display name
  description: string;       // Short description
  priceInr: number;          // Price in INR (rupees, not paise)
  billingPeriod: 'MONTHLY' | 'YEARLY' | 'ONE_TIME' | 'FREE';
  currency: string;          // e.g. INR
  features: IPlanFeature[];  // Feature list for display
  limits: {
    maxPhotos: number;
    maxVideos: number;
    maxEvents: number;
    maxStorageGb: number;
    aiSearchEnabled: boolean;
    watermarkEnabled: boolean;
    portfolioEnabled: boolean;
    bulkDownloadEnabled: boolean;
    whitelabelEnabled: boolean;
    prioritySupport: boolean;
  };
  isActive: boolean;          // Only active plans are shown
  isRecommended: boolean;     // Highlight as recommended/popular
  sortOrder: number;          // Display order
  razorpayPlanId?: string;    // For recurring subscriptions (if used)
  taxRate: number;            // e.g. 0.18 for 18% GST
  ctaText: string;            // Button text
  ctaHref: string;            // Button link
  createdAt: Date;
  updatedAt: Date;
}

const PlanFeatureSchema = new Schema<IPlanFeature>({
  text: { type: String, required: true },
  included: { type: Boolean, default: true },
}, { _id: false });

const PricingPlanSchema = new Schema<IPricingPlan>({
  planKey: { 
    type: String, 
    required: true, 
    unique: true, 
    uppercase: true, 
    trim: true,
    index: true 
  },
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  priceInr: { type: Number, required: true, min: 0 },
  billingPeriod: { 
    type: String, 
    enum: ['MONTHLY', 'YEARLY', 'ONE_TIME', 'FREE'], 
    required: true 
  },
  currency: { type: String, default: 'INR', uppercase: true },
  features: { type: [PlanFeatureSchema], default: [] },
  limits: {
    maxPhotos: { type: Number, default: 0 },
    maxVideos: { type: Number, default: 0 },
    maxEvents: { type: Number, default: 5 },
    maxStorageGb: { type: Number, default: 1 },
    aiSearchEnabled: { type: Boolean, default: false },
    watermarkEnabled: { type: Boolean, default: false },
    portfolioEnabled: { type: Boolean, default: false },
    bulkDownloadEnabled: { type: Boolean, default: false },
    whitelabelEnabled: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
  },
  isActive: { type: Boolean, default: true },
  isRecommended: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  razorpayPlanId: { type: String },
  taxRate: { type: Number, default: 0.18, min: 0, max: 1 },
  ctaText: { type: String, default: 'Choose Plan' },
  ctaHref: { type: String, default: '/signup' },
}, {
  timestamps: true
});

export const PricingPlan = mongoose.model<IPricingPlan>('PricingPlan', PricingPlanSchema);
export default PricingPlan;
