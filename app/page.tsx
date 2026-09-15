'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Sidebar from '@/components/Sidebar';
import type { Chat, Message } from '@/lib/chatTypes';
import {
  addMessage,
  createChat,
  deleteChat,
  getChats,
  getMessages,
  updateChatPinned,
  updateChatTitle,
} from '@/lib/chats';
import { getChatDocument } from '@/lib/documents';

const emptyMessages: Message[] = [];

function createUniqueId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function currentTitle(content: string) {
  const title = content.trim();
  return title.length > 40 ? `${title.slice(0, 40)}...` : title || 'New chat';
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const messages = activeChat?.messages ?? emptyMessages;
  const activePdfName = activeChat?.pdfFileName ?? '';

  function createMessageId() {
    return createUniqueId('message');
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;

    async function loadChats() {
      try {
        const savedChats = await getChats();
        if (cancelled) return;
        if (savedChats.length === 0) {
          const newChat = await createChat();
          if (cancelled) return;
          setChats([newChat]);
          setActiveChatId(newChat.id);
        } else {
          setChats(savedChats);
          setActiveChatId(savedChats[0].id);
        }
      } catch (error) {
        console.error('Failed to load chats:', error);
        if (!cancelled)
          setDataError(
            'Unable to load your chats. Please refresh and try again.',
          );
      } finally {
        if (!cancelled) setChatsLoading(false);
      }
    }

    void loadChats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeChatId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMessagesLoading(true);
    });

    async function loadMessages() {
      try {
        const savedMessages = await getMessages(activeChatId);
        if (!cancelled) {
          setChats((prev) =>
            prev.map((chat) =>
              chat.id === activeChatId
                ? { ...chat, messages: savedMessages }
                : chat,
            ),
          );
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        if (!cancelled) setDataError('Unable to load messages for this chat.');
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) return;
    let cancelled = false;

    async function loadDocument() {
      try {
        const document = await getChatDocument(activeChatId);
        if (!cancelled) {
          setChats((prev) =>
            prev.map((chat) =>
              chat.id === activeChatId
                ? {
                    ...chat,
                    pdfFileName: document?.file_name ?? null,
                  }
                : chat,
            ),
          );
        }
      } catch (error) {
        console.error('Failed to load chat document:', error);
        if (!cancelled) setDataError("Unable to load this chat's PDF status.");
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
    };
  }, [activeChatId]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  async function sendMessage() {
    if (!input.trim() || loading || sendingRef.current || !activeChat) return;

    sendingRef.current = true;
    const chatId = activeChat.id;
    const currentInput = input;
    setInput('');
    setLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const userMessage = await addMessage(chatId, 'user', currentInput);
      const shouldTitleChat = activeChat.title === 'New Chat';
      const nextTitle = shouldTitleChat
        ? currentTitle(currentInput)
        : activeChat.title;

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                title: nextTitle,
                messages: [...chat.messages, userMessage],
              }
            : chat,
        ),
      );

      if (shouldTitleChat) {
        await updateChatTitle(chatId, nextTitle);
      }

      const res = await fetch('/api/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentInput, chatId }),
        signal: abortController.signal,
      });

      if (!res.body) {
        throw new Error('Response body is null');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const streamingAssistant: Message = {
        id: createMessageId(),
        role: 'assistant',
        content: '',
      };
      let assistantContent = '';

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, streamingAssistant] }
            : chat,
        ),
      );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        setChats((prev) =>
          prev.map((chat) => {
            if (chat.id !== chatId) return chat;
            const lastMessageIndex = chat.messages.length - 1;
            const lastMessage = chat.messages[lastMessageIndex];
            if (!lastMessage || lastMessage.role !== 'assistant') return chat;

            return {
              ...chat,
              messages: chat.messages.map((message, index) =>
                index === lastMessageIndex
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            };
          }),
        );
      }

      const assistantMessage = await addMessage(
        chatId,
        'assistant',
        assistantContent,
      );
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === streamingAssistant.id
                    ? assistantMessage
                    : message,
                ),
              }
            : chat,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        setChats((prev) =>
          prev.map((chat) => {
            if (chat.id !== chatId) return chat;
            const lastMessage = chat.messages[chat.messages.length - 1];
            return lastMessage?.role === 'assistant' &&
              lastMessage.content === ''
              ? { ...chat, messages: chat.messages.slice(0, -1) }
              : chat;
          }),
        );
      } else {
        console.error('Failed to send message:', error);
        setDataError(
          error instanceof Error
            ? error.message
            : 'Unable to send or save this message.',
        );
      }
    } finally {
      setLoading(false);
      sendingRef.current = false;
      abortControllerRef.current = null;
    }
  }

  function cancelMessage() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);

      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }

      copyTimeoutRef.current = setTimeout(() => {
        setCopiedMessageId(null);
      }, 1500);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function handlePdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;

    setUploadingPdf(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (activeChat?.id) formData.append('chatId', activeChat.id);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'PDF upload failed.');
      }

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChat?.id
            ? {
                ...chat,
                pdfFileName: file.name,
              }
            : chat,
        ),
      );
    } catch (error: unknown) {
      console.error('Failed to upload PDF:', error);
      setUploadError(
        error instanceof Error ? error.message : 'PDF upload failed.',
      );
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleNewChat() {
    if (loading || sendingRef.current) return;

    try {
      const newChat = await createChat();
      setChats((prev) => [...prev, newChat]);
      setActiveChatId(newChat.id);
      setInput('');
      setUploadError('');
    } catch (error) {
      console.error('Failed to create chat:', error);
      setDataError('Unable to create a new chat. Please try again.');
    }
  }

  async function handleTogglePin(chatId: string) {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;

    try {
      await updateChatPinned(chatId, !chat.pinned);
      setChats((prev) =>
        prev.map((item) =>
          item.id === chatId ? { ...item, pinned: !item.pinned } : item,
        ),
      );
    } catch (error) {
      console.error('Failed to update chat pin:', error);
      setDataError('Unable to update that chat. Please try again.');
    }
  }

  async function handleSelectChat(chatId: string) {
    if (chatId === activeChat?.id || loading || sendingRef.current) return;

    setActiveChatId(chatId);
    setInput('');
    setUploadError('');
  }

  async function handleDeleteChat(chatId: string) {
    if (loading || sendingRef.current) return;

    const chat = chats.find((item) => item.id === chatId);
    if (!chat) return;

    try {
      await deleteChat(chatId);
      const remainingChats = chats.filter((item) => item.id !== chatId);
      if (remainingChats.length === 0) {
        const replacement = await createChat();
        remainingChats.push(replacement);
      }
      setChats(remainingChats);
      if (chatId === activeChat?.id) {
        const nextChat = [...remainingChats].sort(
          (left, right) => right.createdAt - left.createdAt,
        )[0];
        setActiveChatId(nextChat.id);
        setInput('');
      }
    } catch (error) {
      console.error('Failed to delete chat:', error);
      setDataError('Unable to delete that chat. Please try again.');
    }
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-red-50 via-white to-red-100 dark:from-gray-900 dark:via-gray-800 dark:to-red-950 transition-colors duration-300">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-500/10 dark:bg-red-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-600/10 dark:bg-red-600/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        ></div>
      </div>

      <div className="relative flex h-full w-full">
        <Sidebar
          chats={[...chats].sort(
            (left, right) =>
              Number(right.pinned) - Number(left.pinned) ||
              right.createdAt - left.createdAt,
          )}
          activeChatId={activeChat?.id ?? activeChatId}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onTogglePin={handleTogglePin}
          onDeleteChat={handleDeleteChat}
        />

        <main className="flex min-w-0 flex-1 flex-col p-4 md:p-6 lg:p-8">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="fixed left-2 top-4 z-40 rounded-md border border-red-200 bg-white/85 p-1 text-red-600 shadow-sm backdrop-blur"
              aria-label="Open conversations"
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
          )}
          <header className="flex items-center justify-between mb-6 md:mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30 overflow-hidden">
                <img
                  src="/logo.jpg"
                  alt="Spidey"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-red-600 to-red-800 dark:from-red-400 dark:to-red-600 bg-clip-text text-transparent">
                  Spidey
                </h1>
                <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 font-medium">
                  Your friendly neighborhood AI assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${loading ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}
              ></div>
              <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                {loading ? 'Online' : 'Ready'}
              </span>
            </div>
          </header>

          {dataError && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <span>{dataError}</span>
              <button
                type="button"
                onClick={() => setDataError('')}
                className="ml-4 font-semibold hover:text-red-900 dark:hover:text-red-100"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-4 md:space-y-6 mb-4 md:mb-6 pr-2 custom-scrollbar">
            {chatsLoading || messagesLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                {chatsLoading ? 'Loading your chats...' : 'Loading messages...'}
              </div>
            ) : (
              <>
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
                    <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30 rounded-full flex items-center justify-center mb-6 shadow-lg">
                      <svg
                        className="w-10 h-10 md:w-12 md:h-12 text-red-500 dark:text-red-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                      Welcome to Spidey
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base max-w-md">
                      Ask me anything! I&apos;m here to help you with questions,
                      ideas, or just a friendly chat.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2 justify-center">
                      {[
                        'What can you do?',
                        'Tell me a joke',
                        'Help me brainstorm',
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setInput(suggestion)}
                          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300 hover:border-red-500 dark:hover:border-red-500 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 shadow-sm hover:shadow-md"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div
                      className={`w-fit max-w-[85%] break-words p-4 md:max-w-[75%] md:p-5 rounded-2xl shadow-lg ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-red-500 to-red-600 text-white rounded-br-md'
                          : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md border border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                            <img
                              src="/logo.jpg"
                              alt="Spidey"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <span
                          className={`text-xs font-semibold ${msg.role === 'user' ? 'text-red-100' : 'text-red-600 dark:text-red-400'}`}
                        >
                          {msg.role === 'user' ? 'You' : 'Spidey'}
                        </span>
                      </div>
                      {msg.role === 'assistant' &&
                      loading &&
                      i === messages.length - 1 ? (
                        <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">
                          {msg.content}
                        </div>
                      ) : msg.role === 'assistant' ? (
                        <div className="text-sm md:text-base leading-relaxed [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_strong]:font-bold [&_a]:text-red-600 [&_a]:underline [&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_th]:border [&_th]:border-gray-300 [&_th]:bg-red-50 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 dark:[&_th]:border-gray-600 dark:[&_th]:bg-gray-700 dark:[&_td]:border-gray-600">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">
                          {msg.content}
                        </div>
                      )}
                      {!(
                        msg.role === 'assistant' &&
                        loading &&
                        i === messages.length - 1
                      ) && (
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => copyMessage(msg)}
                            className={`rounded-md p-1 transition-colors ${
                              msg.role === 'user'
                                ? 'text-red-100 hover:bg-white/15 hover:text-white'
                                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                            }`}
                            aria-label={
                              copiedMessageId === msg.id
                                ? 'Message copied'
                                : 'Copy message'
                            }
                            title={
                              copiedMessageId === msg.id
                                ? 'Message copied'
                                : 'Copy message'
                            }
                          >
                            {copiedMessageId === msg.id ? (
                              <svg
                                className="h-4 w-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                aria-hidden="true"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="m5 12 4 4L19 6"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="h-4 w-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.8}
                                aria-hidden="true"
                              >
                                <rect
                                  width="13"
                                  height="13"
                                  x="8"
                                  y="8"
                                  rx="2"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 p-4 md:p-5 rounded-2xl rounded-bl-md shadow-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center overflow-hidden">
                          <img
                            src="/logo.jpg"
                            alt="Spidey"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                          Spidey
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        <div
                          className="w-2 h-2 bg-red-500 rounded-full animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-red-500 rounded-full animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-red-500 rounded-full animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex flex-col gap-2 md:gap-3 pt-4 md:pt-6 bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl p-3 md:p-4 shadow-xl border border-gray-200 dark:border-gray-700">
            {(uploadingPdf || activePdfName || uploadError) && (
              <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
                {uploadingPdf && <span>Processing PDF...</span>}
                {!uploadingPdf && activePdfName && (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    PDF loaded: {activePdfName}
                  </span>
                )}
                {!uploadingPdf && uploadError && (
                  <span className="text-red-600 dark:text-red-400">
                    {uploadError}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2 md:gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPdf}
                className="border border-red-300 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40 px-3 md:px-4 py-3 md:py-4 rounded-xl font-semibold transition-all duration-200 text-sm md:text-base whitespace-nowrap"
              >
                {uploadingPdf ? 'Uploading...' : 'Upload PDF'}
              </button>
              <input
                type="text"
                className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 md:py-4 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm md:text-base"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Spidey anything..."
                disabled={loading}
                autoComplete="off"
              />
              {loading ? (
                <button
                  onClick={cancelMessage}
                  className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white px-5 md:px-7 py-3 md:py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg flex items-center gap-2 text-sm md:text-base"
                >
                  <svg
                    className="w-4 h-4 md:w-5 md:h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span className="hidden sm:inline">Cancel</span>
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white px-5 md:px-7 py-3 md:py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-red-500/30 hover:shadow-red-500/50 flex items-center gap-2 text-sm md:text-base"
                >
                  <span>Send</span>
                  <svg
                    className="w-4 h-4 md:w-5 md:h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </main>
      </div>

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #475569;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </div>
  );
}
