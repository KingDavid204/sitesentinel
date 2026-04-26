'use client';

import { useEffect, useState } from 'react';
import VoiceSession, { Transcript } from '@/components/VoiceSession';

type Detection = [string, number];

type EventItem = {
  worker_id: string;
  ppe_status: string;
  detected: Detection[];
  timestamp: string;
  received_at: string;
};

type AgentIdentity = {
  verified: boolean;
  agent_id?: string;
  issuer?: string;
  audience?: string | string[];
  error?: string;
};

type DecideResponse = {
  ok: boolean;
  verdict?: 'fit' | 'unfit' | 'review';
  reason?: string;
  elapsed_ms?: number;
  error?: string;
  agent?: AgentIdentity;
};

const STATUS_CONFIG: Record<string, { bg: string; label: string; emoji: string }> = {
  compliant:    { bg: 'bg-green-600', label: 'FIT FOR DUTY',         emoji: '✓' },
  no_person:    { bg: 'bg-slate-700', label: 'STAND BY',              emoji: '⏸' },
  missing_hat:  { bg: 'bg-red-600',   label: 'PPE MISSING — HARD HAT', emoji: '✗' },
  missing_vest: { bg: 'bg-red-600',   label: 'PPE MISSING — VEST',     emoji: '✗' },
  no_data:      { bg: 'bg-slate-800', label: 'WAITING FOR DATA',       emoji: '…' },
};

const VERDICT_CONFIG: Record<string, { bg: string; label: string; emoji: string }> = {
  fit:    { bg: 'bg-emerald-700',  label: 'FIT FOR DUTY',  emoji: '✅' },
  unfit:  { bg: 'bg-rose-700',     label: 'UNFIT — HOLD',  emoji: '⛔' },
  review: { bg: 'bg-amber-700',    label: 'REVIEW',        emoji: '⚠️' },
};

const formatDetected = (d: Detection[] | undefined) => {
  if (!d || d.length === 0) return 'none';
  return d.map(([name, conf]) => `${name} ${conf.toFixed(2)}`).join(', ');
};

const rowColor = (status: string) => {
  if (status === 'compliant') return 'text-green-400';
  if (status === 'missing_hat' || status === 'missing_vest') return 'text-red-400';
  return 'text-slate-500';
};

const shortId = (id?: string) => {
  if (!id) return '';
  const base = id.replace('@clients', '');
  if (base.length <= 16) return id;
  return `${base.slice(0, 8)}…${base.slice(-4)}@clients`;
};

export default function Dashboard() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [now, setNow] = useState(Date.now());
  const [decision, setDecision] = useState<DecideResponse | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<Transcript | null>(null);

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

  const runDecisionWith = async (transcript: Transcript) => {
    if (!latest) return;
    setDeciding(true);
    setDecision(null);
    try {
      const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: latest.worker_id,
          ppe_status: latest.ppe_status,
          detected: latest.detected,
          transcript,
        }),
      });
      const data: DecideResponse = await res.json();
      setDecision(data);
    } catch (e) {
      setDecision({ ok: false, error: String(e) });
    } finally {
      setDeciding(false);
    }
  };

  const handleVoiceComplete = (transcript: Transcript) => {
    setLastTranscript(transcript);
    runDecisionWith(transcript);
  };

  const vCfg = decision?.verdict ? VERDICT_CONFIG[decision.verdict] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <header className="mb-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight">SiteSentinel</h1>
        <p className="text-slate-400 text-sm">Pre-shift safety check — live</p>
      </header>

      <main className="max-w-2xl mx-auto space-y-6">
        <div className={`${cfg.bg} rounded-xl p-8 transition-colors duration-300`}>
          <div className="text-sm uppercase tracking-widest opacity-75">
            {latest?.worker_id ?? '—'}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-6xl">{cfg.emoji}</span>
            <span className="text-3xl font-bold">{cfg.label}</span>
          </div>
          <div className="mt-6 text-sm opacity-75">
            Detected: {formatDetected(latest?.detected)}
          </div>
          <div className="mt-2 text-sm opacity-75">
            Last update: {latest ? ageSec + 's ago' : '—'}
          </div>
        </div>

        <VoiceSession onComplete={handleVoiceComplete} disabled={deciding} />

        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="mb-3">
            <div className="text-xs uppercase tracking-widest text-slate-400">
              Fit-for-duty decision
            </div>
            <div className="text-sm text-slate-500">Local Gemma 4 · runs offline · Auth0-signed agent</div>
          </div>

          {!decision && !deciding && (
            <div className="text-slate-500 text-sm">
              Waiting for voice briefing to complete…
            </div>
          )}

          {deciding && (
            <div className="text-slate-400 text-sm">Asking Gemma 4 locally…</div>
          )}

          {decision && decision.ok && vCfg && (
            <div className={`${vCfg.bg} rounded-lg p-4`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{vCfg.emoji}</span>
                <span className="text-2xl font-bold">{vCfg.label}</span>
              </div>
              <div className="mt-3 text-sm opacity-90">{decision.reason}</div>
              <div className="mt-2 text-xs opacity-60">
                Decided in {decision.elapsed_ms}ms · model: gemma4:e4b · local
              </div>

              {decision.agent && (
                <div className="mt-3 pt-3 border-t border-white/20">
                  {decision.agent.verified ? (
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-base leading-none mt-0.5">🔐</span>
                      <div className="font-mono space-y-0.5">
                        <div className="opacity-90">
                          Signed by <span className="font-bold">SafetyOfficerAgent</span> · Auth0 verified
                        </div>
                        <div className="opacity-60 break-all">
                          client_id: {shortId(decision.agent.agent_id)}
                        </div>
                        <div className="opacity-60 break-all">
                          iss: {decision.agent.issuer}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs opacity-70">
                      ⚠ Agent identity unverified ({decision.agent.error ?? 'no Auth0 token'})
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {decision && !decision.ok && (
            <div className="bg-rose-900 rounded-lg p-4 text-sm">
              Decision failed: {decision.error}
            </div>
          )}

          {lastTranscript && lastTranscript.length > 0 && (
            <details className="mt-4 text-xs text-slate-500">
              <summary className="cursor-pointer hover:text-slate-300">
                Transcript ({lastTranscript.length} Q/A)
              </summary>
              <div className="mt-2 space-y-2">
                {lastTranscript.map((t, i) => (
                  <div key={i}>
                    <div className="text-slate-400">Q: {t.question}</div>
                    <div className="text-slate-300">A: {t.answer}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Recent events</h2>
          <div className="space-y-1 text-sm font-mono text-slate-400">
            {events.slice(0, 10).map((e, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-slate-500 w-24">
                  {new Date(e.received_at).toLocaleTimeString()}
                </span>
                <span className={`${rowColor(e.ppe_status)} w-32`}>
                  {e.ppe_status}
                </span>
                <span>{formatDetected(e.detected)}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
