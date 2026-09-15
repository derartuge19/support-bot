import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const embeddingModel = 'gemini-embedding-001';

export async function embedTexts(texts: string[], outputDimensionality = 1536) {
  if (texts.length === 0) return [];

  const response = await ai.models.embedContent({
    model: embeddingModel,
    contents: texts,
    config: { outputDimensionality },
  });

  const embeddings = response.embeddings?.map(
    (embedding) => embedding.values ?? [],
  );

  if (
    !embeddings ||
    embeddings.length !== texts.length ||
    embeddings.some((embedding) => embedding.length === 0)
  ) {
    throw new Error('Gemini returned incomplete embeddings.');
  }

  return embeddings;
}

export async function embedText(text: string, outputDimensionality = 1536) {
  const [embedding] = await embedTexts([text], outputDimensionality);
  return embedding;
}
