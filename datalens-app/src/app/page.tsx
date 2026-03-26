'use client';

import { useState, useEffect, useRef } from 'react';
import { useFileQueue } from '@/lib/useFileQueue';
import { useMultiChat } from '@/lib/useMultiChat';
import { ToastProvider, useToast } from '@/lib/toast';
import FileSidebar from '@/components/layout/FileSidebar';
import FileMainArea from '@/components/layout/FileMainArea';
import GlobalChatBar from '@/components/layout/GlobalChatBar';
import AdminView from '@/components/layout/AdminView';
import ToastContainer from '@/components/layout/ToastContainer';

function AppContent() {
  const queue = useFileQueue();
  const chat = useMultiChat(queue.readyFiles, queue.selectedFile);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { toast } = useToast();

  // Track file status changes to emit toasts
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const prev = prevStatusRef.current;
    queue.files.forEach((file) => {
      const prevStatus = prev.get(file.fileId);
      if (prevStatus && prevStatus !== file.status) {
        if (file.status === 'READY') {
          toast({
            type: 'success',
            title: 'Archivo listo',
            description: `"${file.fileName}" fue procesado correctamente.`,
          });
        } else if (file.status === 'VALIDATION_FAILED') {
          toast({
            type: 'warning',
            title: 'Validación con observaciones',
            description: `"${file.fileName}" tiene advertencias SQL. Revisalas en la pestaña Validación.`,
          });
        } else if (file.status === 'BLUEPRINT_READY' || file.status === 'AWAITING_APPROVAL') {
          toast({
            type: 'info',
            title: 'Blueprint listo para revisar',
            description: `"${file.fileName}" está esperando tu aprobación.`,
          });
        } else if (file.status === 'ERROR') {
          toast({
            type: 'error',
            title: 'Error al procesar',
            description: `"${file.fileName}" no pudo procesarse.`,
          });
        }
      }
      prev.set(file.fileId, file.status);
    });
    prevStatusRef.current = new Map(prev);
  }, [queue.files, toast]);

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
      {/* Mobile sidebar overlay */}
      {showMobileSidebar && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* File sidebar */}
      <FileSidebar
        files={queue.files}
        selectedFileId={queue.selectedFileId}
        onSelectFile={(id) => {
          queue.setSelectedFileId(id);
          setShowMobileSidebar(false);
        }}
        onAddFiles={queue.enqueueFiles}
        sessionId={queue.selectedFile?.sessionId ?? null}
        onOpenAdmin={() => setShowAdmin(true)}
        isMobileOpen={showMobileSidebar}
      />

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="flex items-center justify-between p-4 bg-surface-dark border-b border-border-dark sticky top-0 z-10 md:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="mr-1 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Abrir menú"
            >
              <span className="material-symbols-outlined text-xl">menu</span>
            </button>
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
          selectedFileName={queue.selectedFile?.fileName ?? null}
        />
      </main>

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
