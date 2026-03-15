'use client';

import React, { useCallback, useState } from 'react';
import Papa from 'papaparse';

interface FileUploaderProps {
    onDataLoaded: (data: Record<string, unknown>[]) => void;
    isLoading: boolean;
}

export default function FileUploader({ onDataLoaded, isLoading }: FileUploaderProps) {
    const [dragActive, setDragActive] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const processFile = useCallback((file: File) => {
        setError(null);
        if (!file.name.endsWith('.csv')) {
            setError('Por favor, selecciona un archivo CSV.');
            return;
        }

        Papa.parse<Record<string, unknown>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    console.warn(`PapaParse encontró ${results.errors.length} advertencias/errores:`, results.errors.slice(0, 5));
                    if (results.data.length === 0) {
                        setError('No se pudo leer el archivo. Asegúrate de que tenga un formato CSV válido.');
                        return;
                    }
                }

                setError(null);
                onDataLoaded(results.data);
            }
        });
    }, [onDataLoaded]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    }, [processFile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    return (
        <div
            className={`group relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed bg-primary/5 hover:bg-primary/10 transition-all p-12 text-center cursor-pointer ${dragActive ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-primary/30'
                }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
            <input
                type="file"
                id="file-upload"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                accept=".csv"
                onChange={handleChange}
                disabled={isLoading}
            />

            <div className="flex flex-col items-center justify-center relative z-10 pointer-events-none">
                <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2 transition-transform group-hover:scale-110">
                    <span className="material-symbols-outlined text-3xl">cloud_upload</span>
                </div>
                <div>
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">Arrastra y suelta tus archivos aquí</p>
                    <p className="text-sm text-slate-500">Formato soportado: CSV. Tamaño máximo 50MB.</p>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2 rounded-lg mt-4 w-full">
                        <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                    </div>
                )}

                {isLoading ? (
                    <div className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="size-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin"></div>
                        <span className="text-sm">Procesando archivo...</span>
                    </div>
                ) : !error && (
                    <div className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-all shadow-md">
                        <span className="material-symbols-outlined text-sm">add</span>
                        Explorar Archivos
                    </div>
                )}
            </div>
        </div>
    );
}
