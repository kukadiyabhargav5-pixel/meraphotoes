import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { PricingPlan, IPricingPlan } from '../models/PricingPlan';

/**
 * Default seed plans — used to initialise the database if no plans exist.
 * These are the canonical prices. Once seeded, pricing is managed via the admin panel/DB only.
 */
const DEFAULT_PLANS: Partial<IPricingPlan>[] = [
  {
    planKey: 'BASIC',
    name: 'Basic',
    description: 'Get started free — perfect for trying out Mara Photo',
    priceInr: 0,
    billingPeriod: 'FREE',
    currency: 'INR',
    isActive: true,
    isRecommended: false,
    sortOrder: 0,
    taxRate: 0,
    ctaText: 'Get Started Free',
    ctaHref: '/signup',
    features: [
      { text: 'Up to 5 events', included: true },
      { text: 'Store 1,000 photos', included: true },
      { text: 'Store 2 videos', included: true },
      { text: 'Basic gallery sharing', included: true },
      { text: 'QR code generation', included: true },
    ],
    limits: {
      maxPhotos: 1000,
      maxVideos: 2,
      maxEvents: 5,
      maxStorageGb: 2,
      aiSearchEnabled: false,
      watermarkEnabled: false,
      portfolioEnabled: false,
      bulkDownloadEnabled: false,
      whitelabelEnabled: false,
      prioritySupport: false,
    },
  },
  {
    planKey: 'STARTUP',
    name: 'Startup',
    description: 'Store 50,000 photos & 10 videos',
    priceInr: 3999,
    billingPeriod: 'YEARLY',
    currency: 'INR',
    isActive: true,
    isRecommended: false,
    sortOrder: 1,
    taxRate: 0.18,
    ctaText: 'Choose Startup',
    ctaHref: '/signup',
    features: [
      { text: 'Store 50,000 photos', included: true },
      { text: 'Store 10 videos', included: true },
      { text: 'Create & Manage Events', included: true },
      { text: 'Quotation Generator', included: true },
      { text: 'Profile & Galleries', included: true },
    ],
    limits: {
      maxPhotos: 50000,
      maxVideos: 10,
      maxEvents: 50,
      maxStorageGb: 50,
      aiSearchEnabled: false,
      watermarkEnabled: true,
      portfolioEnabled: false,
      bulkDownloadEnabled: false,
      whitelabelEnabled: false,
      prioritySupport: false,
    },
  },
  {
    planKey: 'STANDARD',
    name: 'Standard',
    description: 'Store 1,00,000 photos & 20 videos',
    priceInr: 7999,
    billingPeriod: 'YEARLY',
    currency: 'INR',
    isActive: true,
    isRecommended: true,
    sortOrder: 2,
    taxRate: 0.18,
    ctaText: 'Choose Standard',
    ctaHref: '/signup',
    features: [
      { text: 'Store 1,00,000 photos', included: true },
      { text: 'Store 20 videos', included: true },
      { text: 'ALL Dashboard Tools Enabled', included: true },
      { text: 'Bill & Invoice Generator', included: true },
      { text: 'Lead Capture & Branding', included: true },
      { text: 'Watermarks', included: true },
    ],
    limits: {
      maxPhotos: 100000,
      maxVideos: 20,
      maxEvents: 200,
      maxStorageGb: 100,
      aiSearchEnabled: false,
      watermarkEnabled: true,
      portfolioEnabled: true,
      bulkDownloadEnabled: true,
      whitelabelEnabled: false,
      prioritySupport: false,
    },
  },
  {
    planKey: 'ESSENTIAL',
    name: 'Essential',
    description: 'Store 1,50,000 photos & 50 videos',
    priceInr: 12999,
    billingPeriod: 'YEARLY',
    currency: 'INR',
    isActive: true,
    isRecommended: false,
    sortOrder: 3,
    taxRate: 0.18,
    ctaText: 'Choose Essential',
    ctaHref: '/signup',
    features: [
      { text: 'Store 1,50,000 photos', included: true },
      { text: 'Store 50 videos', included: true },
      { text: 'ALL Dashboard Tools Enabled', included: true },
      { text: 'High-Speed Optimization', included: true },
      { text: 'Priority 24/7 Support', included: true },
      { text: 'Includes all Standard features', included: true },
    ],
    limits: {
      maxPhotos: 150000,
      maxVideos: 50,
      maxEvents: 500,
      maxStorageGb: 200,
      aiSearchEnabled: true,
      watermarkEnabled: true,
      portfolioEnabled: true,
      bulkDownloadEnabled: true,
      whitelabelEnabled: false,
      prioritySupport: true,
    },
  },
  {
    planKey: 'PREMIUM',
    name: 'Premium',
    description: 'Store 3,00,000 photos & 100 videos',
    priceInr: 19999,
    billingPeriod: 'YEARLY',
    currency: 'INR',
    isActive: true,
    isRecommended: false,
    sortOrder: 4,
    taxRate: 0.18,
    ctaText: 'Choose Premium',
    ctaHref: '/signup',
    features: [
      { text: 'Store 3,00,000 photos', included: true },
      { text: 'Store 100 videos', included: true },
      { text: 'ALL Dashboard Tools Enabled', included: true },
      { text: 'AI Face Recognition Scanner', included: true },
      { text: 'Dedicated VIP Account Manager', included: true },
      { text: 'Includes all Essential features', included: true },
    ],
    limits: {
      maxPhotos: 300000,
      maxVideos: 100,
      maxEvents: 1000,
      maxStorageGb: 500,
      aiSearchEnabled: true,
      watermarkEnabled: true,
      portfolioEnabled: true,
      bulkDownloadEnabled: true,
      whitelabelEnabled: true,
      prioritySupport: true,
    },
  },
];

/**
 * Seed default plans if none exist in DB
 */
export const seedDefaultPlans = async (): Promise<void> => {
  try {
    const count = await PricingPlan.countDocuments();
    if (count === 0) {
      console.log('[PricingPlans] No plans found. Seeding default pricing plans...');
      await PricingPlan.insertMany(DEFAULT_PLANS);
      console.log(`[PricingPlans] Seeded ${DEFAULT_PLANS.length} default plans.`);
    }
  } catch (err: any) {
    console.error('[PricingPlans] Error seeding plans:', err.message);
  }
};

/**
 * GET /api/plans — Public: list all active plans
 */
export const getActivePlans = async (req: Request, res: Response) => {
  try {
    const plans = await PricingPlan.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean();
    return res.json({ success: true, plans });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/plans/:planKey — Public: get a single plan by key
 */
export const getPlanByKey = async (req: Request, res: Response) => {
  try {
    const plan = await PricingPlan.findOne({ 
      planKey: req.params.planKey.toUpperCase(), 
      isActive: true 
    }).lean();
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    return res.json({ success: true, plan });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/admin/plans — Admin: list ALL plans (active + inactive)
 */
export const getAllPlansAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const plans = await PricingPlan.find().sort({ sortOrder: 1 }).lean();
    return res.json({ success: true, plans });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/plans — Admin: create a new plan
 */
export const createPlan = async (req: AuthRequest, res: Response) => {
  try {
    const plan = await PricingPlan.create(req.body);
    return res.status(201).json({ success: true, plan });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A plan with this key already exists' });
    }
    return res.status(500).json({ error: err.message });
  }
};

/**
 * PUT /api/admin/plans/:id — Admin: update a plan
 */
export const updatePlan = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const plan = await PricingPlan.findByIdAndUpdate(id, req.body, { 
      new: true, 
      runValidators: true 
    });
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    return res.json({ success: true, plan });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/admin/plans/:id/toggle — Admin: activate/deactivate a plan
 */
export const togglePlanActive = async (req: AuthRequest, res: Response) => {
  try {
    const plan = await PricingPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    plan.isActive = !plan.isActive;
    await plan.save();
    return res.json({ success: true, plan });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * DELETE /api/admin/plans/:id — Admin: archive a plan (soft delete by deactivating)
 * We don't hard-delete plans because existing subscribers may reference them.
 */
export const archivePlan = async (req: AuthRequest, res: Response) => {
  try {
    const plan = await PricingPlan.findByIdAndUpdate(
      req.params.id, 
      { isActive: false }, 
      { new: true }
    );
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    return res.json({ success: true, message: 'Plan archived', plan });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
