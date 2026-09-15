import { createClient } from '@/lib/supabase/client';
import type { Chat, Message } from '@/lib/chatTypes';

type ChatRow = {
  id: string;
  title: string;
  pinned: boolean;
  created_at: string;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: Message['role'];
  content: string;
  created_at: string;
};

function mapChat(row: ChatRow): Chat {
  return {
    id: row.id,
    title: row.title,
    messages: [],
    createdAt: new Date(row.created_at).getTime(),
    pinned: row.pinned,
    pdfFileName: null,
  };
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
  };
}

export async function getChats(): Promise<Chat[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('chats')
    .select('id, title, pinned, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as ChatRow[]).map(mapChat);
}

export async function createChat(): Promise<Chat> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('You must be signed in to create a chat.');

  const { data, error } = await supabase
    .from('chats')
    .insert({ title: 'New Chat', pinned: false, user_id: user.id })
    .select('id, title, pinned, created_at')
    .single();

  if (error) throw error;
  return mapChat(data as ChatRow);
}

export async function updateChatTitle(chatId: string, title: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('chats')
    .update({ title })
    .eq('id', chatId);

  if (error) throw error;
}

export async function updateChatPinned(chatId: string, pinned: boolean) {
  const supabase = createClient();
  const { error } = await supabase
    .from('chats')
    .update({ pinned })
    .eq('id', chatId);

  if (error) throw error;
}

export async function deleteChat(chatId: string) {
  const supabase = createClient();
  const { error } = await supabase.from('chats').delete().eq('id', chatId);

  if (error) throw error;
}

export async function getMessages(chatId: string): Promise<Message[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('id, chat_id, role, content, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as MessageRow[]).map(mapMessage);
}

export async function addMessage(
  chatId: string,
  role: Message['role'],
  content: string,
): Promise<Message> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .insert({ chat_id: chatId, role, content })
    .select('id, chat_id, role, content, created_at')
    .single();

  if (error) throw error;
  return mapMessage(data as MessageRow);
}
