'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Chat } from '@/lib/chatTypes';
import { createClient } from '@/lib/supabase/client';

type SidebarProps = {
  chats: Chat[];
  activeChatId: string;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onTogglePin: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
};

export default function Sidebar({
  chats,
  activeChatId,
  open,
  onClose,
  onNewChat,
  onSelectChat,
  onTogglePin,
  onDeleteChat,
}: SidebarProps) {
  const router = useRouter();
  const [width, setWidth] = useState(288);
  const [pendingDeleteChat, setPendingDeleteChat] = useState<Chat | null>(null);
  const resizingRef = useRef(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!resizingRef.current) return;
      setWidth(Math.min(420, Math.max(220, event.clientX)));
    }

    function stopResizing() {
      resizingRef.current = false;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
    };
  }, []);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-20 bg-black/20 md:hidden"
        />
      )}
      <aside
        style={{ width: open ? width : 0 }}
        className={`fixed inset-y-0 left-0 z-30 flex shrink-0 flex-col overflow-hidden border-red-100 bg-white/90 p-4 shadow-xl backdrop-blur-xl transition-[width,transform,padding,border] dark:border-red-950 dark:bg-gray-900/90 md:relative md:z-0 md:shadow-none ${
          open
            ? 'translate-x-0 border-r'
            : '-translate-x-full border-r-0 p-0 md:translate-x-0'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-red-700 dark:text-red-300">
              Conversations
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your saved chats
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-red-500 to-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition hover:from-red-600 hover:to-red-700"
        >
          <span className="text-lg leading-none" aria-hidden="true">
            +
          </span>
          New Chat
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          className="mb-4 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          Sign out
        </button>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center gap-2 rounded-xl border p-2 transition-colors ${
                chat.id === activeChatId
                  ? 'border-red-200 bg-red-50 shadow-sm dark:border-red-800 dark:bg-red-950/40'
                  : 'border-transparent hover:border-red-100 hover:bg-red-50/70 dark:hover:border-red-900 dark:hover:bg-red-950/20'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectChat(chat.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                  {chat.title}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {chat.messages.length}{' '}
                  {chat.messages.length === 1 ? 'message' : 'messages'}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onTogglePin(chat.id)}
                className={`rounded-md p-1 transition ${
                  chat.pinned
                    ? 'text-red-600 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'text-gray-400 opacity-60 hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/40'
                }`}
                aria-label={
                  chat.pinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`
                }
                title={chat.pinned ? 'Unpin chat' : 'Pin chat'}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill={chat.pinned ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={1.8}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m9 4 6 6m-8.5-3.5 7 7M5 19l4-4m6-6 4-4M8 20l-1-1 4-4 4 4-1 1-3-3-3 3Z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteChat(chat)}
                className="rounded-md p-1 text-gray-400 opacity-60 transition hover:bg-red-100 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-900/40"
                aria-label={`Delete ${chat.title}`}
                title="Delete chat"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" d="M4 7h16M10 11v6m4-6v6" />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 7l1 13h10l1-13M9 7V4h6v3"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <div
          role="separator"
          aria-label="Resize sidebar"
          onPointerDown={() => {
            resizingRef.current = true;
          }}
          className="absolute right-0 top-0 hidden h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-red-300 md:block"
        />
      </aside>
      {pendingDeleteChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            className="w-full max-w-sm rounded-2xl border border-red-100 bg-white p-5 shadow-2xl dark:border-red-950 dark:bg-gray-900"
          >
            <h3
              id="delete-chat-title"
              className="text-lg font-bold text-gray-900 dark:text-gray-100"
            >
              Delete conversation?
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Delete &ldquo;{pendingDeleteChat.title}&rdquo;? This cannot be
              undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteChat(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteChat(pendingDeleteChat.id);
                  setPendingDeleteChat(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
