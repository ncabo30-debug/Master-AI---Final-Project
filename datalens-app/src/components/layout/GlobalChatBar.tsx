'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/lib/useMultiChat';

interface GlobalChatBarProps {
  readyFilesCount: number;
  chatHistory: ChatMessage[];
  isTyping: boolean;
  onSend: (text: string) => void;
  canChat: boolean;
}

export default function GlobalChatBar({
  readyFilesCount,
  chatHistory,
  isTyping,
  onSend,
  canChat,
}: GlobalChatBarProps) {
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [chatHistory, isTyping]);

  // Auto-expand when first message arrives
  useEffect(() => {
    if (chatHistory.length > 0) setExpanded(true);
  }, [chatHistory.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !canChat || isTyping) return;
    onSend(trimmed);
    setInput('');
  };

  const hint =
    readyFilesCount === 0
      ? 'Sube un archivo para comenzar'
      : `Chat global · ${readyFilesCount} archivo${readyFilesCount > 1 ? 's' : ''} disponible${readyFilesCount > 1 ? 's' : ''}`;

  return (
    <div className="border-t border-border-dark bg-surface-dark">
      {/* Expanded chat history */}
      {expanded && chatHistory.length > 0 && (
        <div
          ref={historyRef}
          className="max-h-64 overflow-y-auto px-4 py-3 space-y-3"
        >
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-2 justify-start">
              <div className="bg-slate-800 text-slate-400 px-3 py-2 rounded-xl rounded-bl-sm text-sm flex items-center gap-1">
                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="size-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-3">
        {chatHistory.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            title={expanded ? 'Colapsar chat' : 'Expandir chat'}
          >
            <span className="material-symbols-outlined text-sm">
              {expanded ? 'expand_more' : 'expand_less'}
            </span>
          </button>
        )}

        <div className="flex-1 flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
          <span className="material-symbols-outlined text-sm text-slate-500 shrink-0">chat</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={hint}
            disabled={!canChat || isTyping}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none disabled:cursor-not-allowed"
          />
          {readyFilesCount > 0 && (
            <span className="text-xs text-slate-600 shrink-0">
              {readyFilesCount} archivo{readyFilesCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!canChat || isTyping || !input.trim()}
          className="size-9 flex items-center justify-center bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <span className="material-symbols-outlined text-sm">send</span>
        </button>
      </div>
    </div>
  );
}
