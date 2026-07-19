import mongoose from 'mongoose';

const quotationSchema = new mongoose.Schema({
  studioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Studio' },
  clientName: { type: String, required: true },
  amount: { type: Number, required: true },
  validUntil: { type: Date, required: true },
  status: { type: String, enum: ['Accepted', 'Pending', 'Rejected'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Quotation', quotationSchema);
