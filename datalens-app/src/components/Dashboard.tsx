'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DashboardProps {
    reportConfig: any;
}

import dynamic from 'next/dynamic';

const DashboardClient = dynamic(() => import('./DashboardContent'), { ssr: false });

export default function Dashboard(props: { reportConfig: any }) {
    return <DashboardClient {...props} />;
}
