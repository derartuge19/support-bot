import { createClient } from '@/lib/supabase/client';

export type DocumentRecord = {
  id: string;
  chat_id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
};

export async function getChatDocument(chatId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('documents')
    .select('id, chat_id, file_name, storage_path, created_at')
    .eq('chat_id', chatId)
    .maybeSingle();

  if (error) throw error;
  return data as DocumentRecord | null;
}
