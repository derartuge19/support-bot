create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_chat_id uuid,
  match_count int default 4
)
returns table (content text, similarity float)
language sql
stable
as $$
  select document_chunks.content,
         1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  join documents on documents.id = document_chunks.document_id
  where documents.chat_id = match_chat_id
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
