import mongoose, { Schema, Document } from 'mongoose';

export interface ISearchSession extends Document {
  sessionId: string;
  eventId: mongoose.Types.ObjectId;
  matchedMediaIds: mongoose.Types.ObjectId[];
  totalMatched: number;
  peakSimilarity?: number;
  queryFramesCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const SearchSessionSchema = new Schema<ISearchSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    matchedMediaIds: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    totalMatched: { type: Number, default: 0 },
    peakSimilarity: { type: Number },
    queryFramesCount: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now, expires: 86400 } // Automatically expires after 24 hours
  },
  {
    timestamps: true
  }
);

SearchSessionSchema.index({ sessionId: 1, eventId: 1 });

export const SearchSession = mongoose.model<ISearchSession>('SearchSession', SearchSessionSchema);
