import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Studio, User } from '../models';

/**
 * Get profile of current authenticated studio owner
 */
export const getMyStudio = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    let studio = await Studio.findOne({ ownerId: req.user._id });
    if (!studio) {
      // Auto-upgrade user's role to STUDIO_OWNER if they are a CLIENT
      const user = await User.findById(req.user._id);
      if (user) {
        if (user.role === 'CLIENT') {
          user.role = 'STUDIO_OWNER';
          await user.save();
          req.user.role = 'STUDIO_OWNER';
        }
      }

      // Auto-create a default Studio profile
      const cleanName = (user ? user.name : 'Mara') + ' Studio';
      const cleanSub = 'studio-' + Math.random().toString(36).substring(2, 8);
      
      studio = await Studio.create({
        name: cleanName,
        subdomain: cleanSub,
        ownerId: req.user._id,
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'ACTIVE',
      });
    } else {
      // Check if user is STUDIO_OWNER in DB
      const user = await User.findById(req.user._id);
      if (user && user.role === 'CLIENT') {
        user.role = 'STUDIO_OWNER';
        await user.save();
        req.user.role = 'STUDIO_OWNER';
      }
    }

    return res.json({ studio });
  } catch (err: any) {
    console.error('getMyStudio error:', err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Update studio configuration details (Branding, Watermark, Domain)
 */
export const updateMyStudio = async (req: AuthRequest, res: Response) => {
  const { name, logoUrl, subdomain, customDomain, watermark, paymentDetails } = req.body;

  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const studio = await Studio.findOne({ ownerId: req.user._id });
    if (!studio) {
      return res.status(404).json({ error: 'Studio profile not found' });
    }

    if (name) studio.name = name;
    if (logoUrl) studio.logoUrl = logoUrl;

    if (subdomain) {
      const cleanSub = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
      const existing = await Studio.findOne({ subdomain: cleanSub, _id: { $ne: studio._id } });
      if (existing) {
        return res.status(400).json({ error: 'Subdomain is already registered by another studio' });
      }
      studio.subdomain = cleanSub;
    }

    if (customDomain !== undefined) {
      if (customDomain) {
        const cleanDom = customDomain.toLowerCase().trim();
        const existing = await Studio.findOne({ customDomain: cleanDom, _id: { $ne: studio._id } });
        if (existing) {
          return res.status(400).json({ error: 'Custom domain is already registered by another studio' });
        }
        studio.customDomain = cleanDom;
      } else {
        studio.customDomain = undefined; // Delete custom domain
      }
    }

    if (watermark) {
      studio.watermark = {
        type: watermark.type || studio.watermark.type,
        text: watermark.text !== undefined ? watermark.text : studio.watermark.text,
        logoUrl: watermark.logoUrl !== undefined ? watermark.logoUrl : studio.watermark.logoUrl,
        position: watermark.position || studio.watermark.position,
        opacity: watermark.opacity !== undefined ? watermark.opacity : studio.watermark.opacity,
        size: watermark.size !== undefined ? watermark.size : studio.watermark.size,
      };
    }

    if (paymentDetails) {
      if (!studio.paymentDetails) {
        studio.paymentDetails = { upiId: '', merchantName: '', uploadedQrUrl: '' };
      }
      if (paymentDetails.upiId !== undefined) studio.paymentDetails.upiId = paymentDetails.upiId;
      if (paymentDetails.merchantName !== undefined) studio.paymentDetails.merchantName = paymentDetails.merchantName;
      if (paymentDetails.uploadedQrUrl !== undefined) studio.paymentDetails.uploadedQrUrl = paymentDetails.uploadedQrUrl;
    }

    await studio.save();
    return res.json({ message: 'Studio updated successfully', studio });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};
