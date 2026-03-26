'use client';

import { useState } from 'react';
import { useFileQueue } from '@/lib/useFileQueue';
import { useMultiChat } from '@/lib/useMultiChat';
import FileSidebar from '@/components/layout/FileSidebar';
import FileMainArea from '@/components/layout/FileMainArea';
import GlobalChatBar from '@/components/layout/GlobalChatBar';
import AdminView from '@/components/layout/AdminView';

export default function Home() {
  const queue = useFileQueue();
  const chat = useMultiChat(queue.readyFiles, queue.selectedFile);
  const [showAdmin, setShowAdmin] = useState(false);

  if (showAdmin) {
    return (
      <AdminView
        sessionId={queue.selectedFile?.sessionId ?? null}
        onBack={() => setShowAdmin(false)}
      />
    );
  }

  return (
    <div className="relative flex h-screen w-full bg-background-dark font-display text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* File sidebar */}
      <FileSidebar
        files={queue.files}
        selectedFileId={queue.selectedFileId}
        onSelectFile={queue.setSelectedFileId}
        onAddFiles={queue.enqueueFiles}
        sessionId={queue.selectedFile?.sessionId ?? null}
        onOpenAdmin={() => setShowAdmin(true)}
      />

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="flex items-center justify-between p-4 bg-surface-dark border-b border-border-dark sticky top-0 z-10 md:hidden">
          <div className="flex items-center gap-2">
            <div className="size-7 bg-primary rounded-lg flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
            </div>
            <h2 className="text-base font-bold text-primary">DataLens AI</h2>
          </div>
          <button
            onClick={() => setShowAdmin(true)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">terminal</span>
          </button>
        </header>

        {/* File area — fills remaining height above chat bar */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <FileMainArea file={queue.selectedFile} queue={queue} />
        </div>

        {/* Global chat bar — pinned at bottom */}
        <GlobalChatBar
          readyFilesCount={chat.readyFilesCount}
          chatHistory={chat.chatHistory}
          isTyping={chat.isTyping}
          onSend={chat.sendMessage}
          canChat={chat.canChat}
        />
      </main>
    </div>
  );
}
