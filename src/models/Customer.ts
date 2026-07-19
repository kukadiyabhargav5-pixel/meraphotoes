import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema({
  studioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Studio' },
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  totalEvents: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  tags: [{ type: String }],
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Customer', customerSchema);
