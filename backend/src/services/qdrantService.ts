import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';

export const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

const COLLECTION_NAME = 'mara_faces';

export const isQdrantAvailable = async (): Promise<boolean> => {
  try {
    // Simple health check - just try to list collections
    await qdrantClient.getCollections();
    return true;
  } catch (err) {
    return false;
  }
};

export const initializeQdrant = async () => {
  try {
    const isAvail = await isQdrantAvailable();
    if (!isAvail) {
      console.warn('[Qdrant] Could not connect to Qdrant vector database. Face search will be unavailable.');
      return;
    }

    const { collections } = await qdrantClient.getCollections();
    const exists = collections.some((c: any) => c.name === COLLECTION_NAME);
    
    if (!exists) {
      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 512, // InsightFace buffalo_l embedding size
          distance: 'Cosine'
        }
      });
      
      // Create payload index for fast filtering by eventId
      await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'eventId',
        field_schema: 'keyword'
      });
      
      console.log(`[Qdrant] Created collection '${COLLECTION_NAME}'`);
    } else {
      console.log(`[Qdrant] Collection '${COLLECTION_NAME}' already exists.`);
    }
  } catch (error) {
    console.error('[Qdrant] Error initializing Qdrant:', error);
  }
};

export const insertFaceEmbedding = async (
  eventId: string,
  mediaId: string,
  embedding: number[],
  faceId: string = uuidv4()
) => {
  try {
    await qdrantClient.upsert(COLLECTION_NAME, {
      wait: true,
      points: [
        {
          id: faceId,
          vector: embedding,
          payload: {
            eventId,
            mediaId
          }
        }
      ]
    });
    return faceId;
  } catch (error) {
    console.error('[Qdrant] Error inserting face embedding:', error);
    throw error;
  }
};

export const searchFaces = async (
  eventId: string,
  queryEmbedding: number[],
  limit: number = 10000, // No arbitrary cap — search entire indexed gallery
  minScore: number = 0.5
) => {
  try {
    const searchResult = await qdrantClient.query(COLLECTION_NAME, {
      query: queryEmbedding,
      limit,
      score_threshold: minScore,
      filter: {
        must: [
          {
            key: 'eventId',
            match: {
              value: eventId
            }
          }
        ]
      }
    });
    
    return searchResult.points || [];
  } catch (error) {
    console.error('[Qdrant] Error searching faces:', error);
    throw error;
  }
};

// Fallback search using MongoDB when Qdrant is unavailable
export const localCosineSearch = async (
  eventId: string,
  queryEmbedding: number[],
  limit: number = 10000, // No arbitrary cap — search entire indexed gallery
  minScore: number = 0.5
) => {
  const { FaceEmbedding } = await import('../models');
  
  // Fetch all embeddings for this event
  const allFaces = await FaceEmbedding.find({ eventId }).lean();
  
  // L2-normalize a vector
  const l2Norm = (vec: number[]): number[] => {
    let sumSq = 0;
    for (const v of vec) sumSq += v * v;
    const norm = Math.sqrt(sumSq);
    if (norm === 0 || Math.abs(norm - 1.0) < 0.01) return vec;
    return vec.map(v => v / norm);
  };
  
  const normalizedQuery = l2Norm(queryEmbedding);
  
  const results = allFaces.map(face => {
    const normalizedFace = l2Norm(face.embedding);
    let dot = 0;
    for (let i = 0; i < normalizedQuery.length; i++) {
      dot += normalizedQuery[i] * normalizedFace[i];
    }
    return {
      id: face._id.toString(),
      score: dot,
      payload: {
        eventId: face.eventId.toString(),
        mediaId: face.mediaId.toString()
      }
    };
  });
  
  // Filter by threshold, sort by score descending, and limit
  return results
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
