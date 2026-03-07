import { NextResponse } from 'next/server';
import { TokenTracker } from '@/lib/TokenTracker';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
        return NextResponse.json({ error: 'sessionId query parameter required.' }, { status: 400 });
    }

    const summary = TokenTracker.getSummary(sessionId);
    return NextResponse.json(summary);
}
