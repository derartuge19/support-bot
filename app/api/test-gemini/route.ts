import Groq from 'groq-sdk';

import { embedText } from '@/lib/embeddings';
import { createClient } from '@/lib/supabase/server';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

type MatchedChunk = {
  content: string;
  similarity: number;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  }

  const { prompt, chatId } = await req.json();
  if (typeof prompt !== 'string' || typeof chatId !== 'string' || !chatId) {
    return Response.json(
      { error: 'prompt and chatId are required.' },
      { status: 400 },
    );
  }

  let retrievedChunks: Array<{ preview: string; similarity: number }> = [];
  let messages: Array<{
    role: 'system' | 'user';
    content: string;
  }> = [{ role: 'user', content: prompt }];

  const queryEmbedding = await embedText(prompt, 1536);
  const { data: rawRelevantChunks, error: retrievalError } = await supabase.rpc(
    'match_document_chunks',
    {
      query_embedding: queryEmbedding,
      match_chat_id: chatId,
      match_count: 4,
    },
  );

  if (retrievalError) throw retrievalError;

  const relevantChunks = (rawRelevantChunks ?? []) as MatchedChunk[];

  if (relevantChunks.length) {
    retrievedChunks = relevantChunks.map((chunk) => ({
      preview: chunk.content.replace(/\s+/g, ' ').trim().slice(0, 100),
      similarity: chunk.similarity,
    }));

    console.log('[RAG] Retrieved chunks for prompt:', retrievedChunks);

    const context = relevantChunks
      .map((chunk) => chunk.content)
      .join('\n\n---\n\n');

    messages = [
      {
        role: 'system',
        content:
          'Answer the user using the provided document context when it is relevant. If the context does not contain the answer, say so clearly and do not invent document-specific facts.',
      },
      {
        role: 'user',
        content: `Document context:\n\n${context}\n\nUser question:\n${prompt}`,
      },
    ];
  }

  const stream = await groq.chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Retrieved-Chunks': encodeURIComponent(
        JSON.stringify({
          used: retrievedChunks.length > 0,
          chunks: retrievedChunks,
        }),
      ),
    },
  });
}
