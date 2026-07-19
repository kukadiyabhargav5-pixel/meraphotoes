import { Request, Response } from 'express';
import axios from 'axios';
import { FaceEmbedding, Media, Studio } from '../models';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// InsightFace (ArcFace buffalo_l) cosine similarity thresholds
// Lowered to 0.45 to aggressively find matches in group photos, side-profiles, and varying lighting
const SIMILARITY_THRESHOLD = 0.45; // Minimum to count as a match
const HIGH_CONFIDENCE_THRESHOLD = 0.65; // High confidence match

/**
 * Calculates cosine similarity between two L2-normalized vectors.
 * For InsightFace ArcFace, values > 0.45 strongly indicate the same person.
 */
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Search photos and videos by uploading a selfie.
 * Flow:
 *   1. Send selfie to AI service → get face embedding(s)
 *   2. Fetch all face embeddings for the event from DB
 *   3. Compare using cosine similarity
 *   4. Return matched media sorted by similarity score
 */
export const searchBySelfie = async (req: Request, res: Response) => {
  const { eventId } = req.params;
  const file = req.file;

  try {
    if (!file) {
      return res.status(400).json({ error: 'Selfie photo file is required.' });
    }

    // 1. Call AI service to extract embedding for the selfie
    let faces: any[] = [];
    try {
      const formData = new FormData();
      const fileBlob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
      formData.append('file', fileBlob, 'selfie.jpg');

      const aiResponse = await axios.post(`${AI_SERVICE_URL}/detect-faces`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000, // 30 second timeout for AI processing
      });

      faces = aiResponse.data.faces || [];
    } catch (aiErr: any) {
      console.error('[AI Search] AI service connection error:', aiErr.message);
      
      if (aiErr.code === 'ECONNREFUSED') {
        return res.status(503).json({ 
          error: 'AI Face Detection service is not running. Please start the AI service on port 8000.' 
        });
      }
      return res.status(500).json({ 
        error: 'AI Face Detection service error. Please try again later.' 
      });
    }

    if (faces.length === 0) {
      return res.status(400).json({ 
        error: 'No face detected in the uploaded photo. Please upload a clear, well-lit photo of your face.' 
      });
    }

    // Use the first (usually largest/most prominent) detected face
    const queryEmbedding = faces[0].embedding;

    // 2. Fetch all face embeddings for this event
    const eventEmbeddings = await FaceEmbedding.find({ eventId });

    if (eventEmbeddings.length === 0) {
      return res.json({ 
        matches: [],
        message: 'No photos have been processed for face detection in this event yet.',
      });
    }

    // 3. Compute similarities against all stored embeddings
    const matches: { mediaId: string; timestamp?: number; similarity: number }[] = [];
    
    for (const item of eventEmbeddings) {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        matches.push({
          mediaId: item.mediaId.toString(),
          timestamp: item.timestamp,
          similarity,
        });
      }
    }

    // 4. Group matches by Media ID (a single photo/video may have multiple face matches)
    const mediaGroups: { 
      [key: string]: { 
        bestSimilarity: number; 
        matchCount: number;
        timestamps: number[];
      } 
    } = {};

    for (const match of matches) {
      if (!mediaGroups[match.mediaId]) {
        mediaGroups[match.mediaId] = {
          bestSimilarity: match.similarity,
          matchCount: 0,
          timestamps: [],
        };
      }
      
      const group = mediaGroups[match.mediaId];
      group.matchCount++;
      
      // Track highest similarity for this media item
      if (match.similarity > group.bestSimilarity) {
        group.bestSimilarity = match.similarity;
      }
      
      // Track video timestamps
      if (match.timestamp !== undefined) {
        group.timestamps.push(match.timestamp);
      }
    }

    // Sort timestamps for video matches
    for (const mId in mediaGroups) {
      mediaGroups[mId].timestamps.sort((a, b) => a - b);
    }

    // 5. Populate Media details
    const matchedMediaIds = Object.keys(mediaGroups);
    const mediaDetails = await Media.find({ _id: { $in: matchedMediaIds } });

    const results = mediaDetails.map((media) => {
      const group = mediaGroups[media._id.toString()];
      const similarityPercent = Math.round(group.bestSimilarity * 100);
      return {
        ...media.toObject(),
        similarity: parseFloat(group.bestSimilarity.toFixed(4)),
        similarityPercent,
        confidence: group.bestSimilarity >= HIGH_CONFIDENCE_THRESHOLD ? 'HIGH' : 'MEDIUM',
        matchCount: group.matchCount,
        timestamps: group.timestamps,
      };
    });

    // Sort by similarity score (highest first)
    results.sort((a, b) => b.similarity - a.similarity);

    // Increment AI search usage
    if (mediaDetails.length > 0) {
      const firstMedia = mediaDetails[0];
      await Studio.findByIdAndUpdate(firstMedia.studioId, { $inc: { 'usage.aiSearchesCount': 1 } });
    }

    console.log(`[AI Search] Found ${results.length} matching media items for event ${eventId}`);

    return res.json({ 
      matches: results,
      totalSearched: eventEmbeddings.length,
      message: results.length > 0 
        ? `Found ${results.length} photo(s)/video(s) matching your face!`
        : 'No matching photos found. The event photos may not have been processed yet.',
    });
  } catch (err: any) {
    console.error('AI Face Search Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
