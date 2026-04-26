'use client';

import { useEffect, useState } from 'react';

type EventItem = {
  worker_id: string;
  ppe_status: string;
  detected: string[];
  timestamp: string;
  received_at: string;
};

const STATUS_CONFIG: Record<string, { bg: string; label: string; emoji: string }> = {
  compliant:    { bg: 'bg-green-600', label: 'FIT FOR DUTY',         emoji: '✓' },
  no_person:    { bg: 'bg-slate-700', label: 'STAND BY',              emoji: '⏸' },
  missing_hat:  { bg: 'bg-red-600',   label: 'PPE MISSING — HARD HAT', emoji: '✗' },
  missing_vest: { bg: 'bg-red-600',   label: 'PPE MISSING — VEST',     emoji: '✗' },
  no_data:      { bg: 'bg-slate-800', label: 'WAITING FOR DATA',       emoji: '…' },
};

export default function Dashboard() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch('/api/events', { cache: 'no-store' });
        const data = await r.json();
        setEvents(data.events ?? []);
        setNow(Date.now());
      } catch {}
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const latest = events[0];
  const status = latest?.ppe_status ?? 'no_data';
  const ageSec = latest ? Math.floor((now - new Date(latest.received_at).getTime()) / 1000) : 0;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.no_data;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <header className="mb-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight">SiteSentinel</h1>
        <p className="text-slate-400 text-sm">Pre-shift safety check — live</p>
      </header>

      <main className="max-w-2xl mx-auto">
        <div className={`${cfg.bg} rounded-xl p-8 transition-colors duration-300`}>
          <div className="text-sm uppercase tracking-widest opacity-75">
            {latest?.worker_id ?? '—'}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-6xl">{cfg.emoji}</span>
            <span className="text-3xl font-bold">{cfg.label}</span>
          </div>
          <div className="mt-6 text-sm opacity-75">
            Detected: {latest?.detected.length ? latest.detected.join(', ') : 'none'}
          </div>
          <div className="mt-2 text-sm opacity-75">
            Last update: {latest ? ageSec + 's ago' : '—'}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">Recent events</h2>
          <div className="space-y-1 text-sm font-mono text-slate-400">
            {events.slice(0, 10).map((e, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-slate-500 w-24">
                  {new Date(e.received_at).toLocaleTimeString()}
                </span>
                <span className={e.ppe_status === 'compliant' ? 'text-green-400 w-24' : 'text-slate-500 w-24'}>
                  {e.ppe_status}
                </span>
                <span>{e.detected.join(', ') || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
