'use client';

import dynamic from 'next/dynamic';
import type { ReportConfig } from '@/lib/agents/types';

const DashboardClient = dynamic(() => import('./DashboardContent'), { ssr: false });

export default function Dashboard(props: { reportConfig: ReportConfig }) {
    return <DashboardClient {...props} />;
}
