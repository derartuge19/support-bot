import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PDFParse } from 'pdf-parse';

import { embedTexts } from '@/lib/embeddings';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const pdfWorkerPath = resolve(
  process.cwd(),
  'node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs',
);
PDFParse.setWorker(pathToFileURL(pdfWorkerPath).toString());

function chunkText(text: string, targetWords = 650, maxWords = 800) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let currentWords: string[] = [];

  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.split(' ');

    for (let index = 0; index < paragraphWords.length; index += maxWords) {
      const words = paragraphWords.slice(index, index + maxWords);

      if (
        currentWords.length > 0 &&
        currentWords.length + words.length > maxWords
      ) {
        chunks.push(currentWords.join(' '));
        currentWords = [];
      }

      currentWords.push(...words);

      if (currentWords.length >= targetWords) {
        chunks.push(currentWords.join(' '));
        currentWords = [];
      }
    }
  }

  if (currentWords.length > 0) {
    chunks.push(currentWords.join(' '));
  }

  return chunks;
}

export async function POST(request: Request) {
  try {
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

    const formData = await request.formData();
    const file = formData.get('file');
    const chatId = formData.get('chatId');

    if (typeof chatId !== 'string' || !chatId) {
      return Response.json({ error: 'A chatId is required.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return Response.json(
        { error: 'A PDF file is required.' },
        { status: 400 },
      );
    }

    if (
      file.type !== 'application/pdf' &&
      !file.name.toLowerCase().endsWith('.pdf')
    ) {
      return Response.json(
        { error: 'Only PDF files are supported.' },
        { status: 400 },
      );
    }

    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('id')
      .eq('id', chatId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (chatError) throw chatError;
    if (!chat) {
      return Response.json({ error: 'Chat not found.' }, { status: 404 });
    }

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${user.id}/${chatId}/${safeFileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { data: existingDocument, error: existingError } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingDocument) {
      const { error: removeError } = await supabase.storage
        .from('pdfs')
        .remove([existingDocument.storage_path]);
      if (removeError) throw removeError;
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', existingDocument.id);
      if (deleteError) throw deleteError;
    }

    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const parser = new PDFParse({
      data: fileBuffer,
    });
    let text: string;

    try {
      const result = await parser.getText();
      text = result.text.trim();
    } finally {
      await parser.destroy();
    }

    if (!text) {
      return Response.json(
        { error: 'No readable text was found in the PDF.' },
        { status: 400 },
      );
    }

    const chunks = chunkText(text);
    const embeddings = await embedTexts(chunks, 1536);
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .insert({
        chat_id: chatId,
        file_name: file.name,
        storage_path: storagePath,
      })
      .select('id, chat_id, file_name, storage_path, created_at')
      .single();

    if (documentError) throw documentError;

    const { error: chunksError } = await supabase
      .from('document_chunks')
      .insert(
        chunks.map((content, index) => ({
          document_id: document.id,
          content,
          embedding: embeddings[index],
        })),
      );

    if (chunksError) throw chunksError;

    return Response.json({
      success: true,
      document,
      chunks: chunks.length,
    });
  } catch (error) {
    console.error('PDF upload failed:', error);
    return Response.json(
      { error: 'Failed to process the PDF.' },
      { status: 500 },
    );
  }
}
