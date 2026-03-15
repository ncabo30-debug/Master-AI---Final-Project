'use client';

/**
 * useMultiChat.ts
 * Global chat hook that operates against the selected file's session.
 */

import { useState, useCallback } from 'react';
import type { FileRecord } from './fileQueue';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function useMultiChat(
  readyFiles: FileRecord[],
  selectedFile: FileRecord | null
) {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!selectedFile?.sessionId || isTyping) return;

      const userMsg: ChatMessage = {
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'chat',
            sessionId: selectedFile.sessionId,
            question: text,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Chat error');

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.answer,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: `Lo siento, ocurrió un error: ${err instanceof Error ? err.message : 'Error desconocido'}`,
          timestamp: new Date(),
        };
        setChatHistory((prev) => [...prev, errorMsg]);
      } finally {
        setIsTyping(false);
      }
    },
    [selectedFile, isTyping]
  );

  return {
    chatHistory,
    isTyping,
    sendMessage,
    readyFilesCount: readyFiles.length,
    canChat: !!selectedFile?.sessionId,
  };
}
