'use client';

import React from 'react';
import { Database, Cpu, Activity, CheckCircle2 } from 'lucide-react';

interface TabsProps {
    currentStep: number;
    completedSteps: number[];
    onTabChange: (step: number) => void;
}

export default function Tabs({ currentStep, completedSteps, onTabChange }: TabsProps) {
    const steps = [
        { id: 1, name: 'Data Source', icon: Database },
        { id: 2, name: 'AI Comprehension', icon: Cpu },
        { id: 3, name: 'Analytics', icon: Activity }
    ];

    return (
        <div className="w-full mb-10 z-10 animate-fade-in relative mt-4">
            <div className="flex items-center justify-between relative max-w-2xl mx-auto">
                {/* Connecting Line Base */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[1px] bg-[var(--glass-border)] -z-10"></div>

                {/* Connecting Line Active */}
                <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] bg-[var(--accent-color)] -z-10 transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]"
                    style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`, boxShadow: '0 0 10px var(--accent-glow)' }}
                ></div>

                {steps.map((step) => {
                    // Una tab es navegable si ya se completó o si es la primera
                    const isCompleted = completedSteps.includes(step.id);
                    const isActive = currentStep === step.id;
                    const isClickable = isCompleted || step.id === 1;
                    const Icon = step.icon;

                    return (
                        <div
                            key={step.id}
                            onClick={() => isClickable && onTabChange(step.id)}
                            className={`flex flex-col items-center gap-3 relative group ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                        >
                            <div className={`
                                w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500
                                ${isActive ? 'bg-[var(--accent-color)] shadow-[0_0_25px_var(--accent-glow)] scale-110 border border-[rgba(255,255,255,0.2)]' :
                                    isCompleted ? 'bg-[var(--glass-bg)] border border-[var(--success-color)] text-[var(--success-color)] shadow-[0_0_15px_rgba(0,255,136,0.1)]' :
                                        'bg-[var(--bg-secondary)] border border-[var(--glass-border)] text-[var(--text-secondary)]'}
                            `}>
                                {isCompleted && !isActive ? <CheckCircle2 size={24} className="text-[var(--success-color)]" /> :
                                    <Icon size={24} className={isActive ? 'text-white' : ''} />}
                            </div>

                            <span className={`text-xs font-display tracking-widest uppercase transition-colors duration-300 absolute -bottom-8 whitespace-nowrap
                                ${isActive ? 'text-white text-shadow-sm' :
                                    isCompleted ? 'text-[var(--text-secondary)] group-hover:text-white' :
                                        'text-[var(--text-secondary)]'}
                            `}>
                                {step.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
