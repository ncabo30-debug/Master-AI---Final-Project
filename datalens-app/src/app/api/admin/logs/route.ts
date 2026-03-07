import { NextResponse } from 'next/server';
import { AgentBus } from '@/lib/agents/core/AgentBus';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (sessionId) {
        return NextResponse.json({ logs: AgentBus.getSessionHistory(sessionId) });
    }

    // If no sessionId provided, return empty (don't leak other sessions)
    return NextResponse.json({ logs: [] });
}

export async function DELETE(req: Request) {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (sessionId) {
        AgentBus.clearSessionHistory(sessionId);
    }

    return NextResponse.json({ success: true });
}
