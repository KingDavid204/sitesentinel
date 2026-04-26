'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from '@elevenlabs/react';

export type Transcript = { question: string; answer: string }[];

type Message = { source: 'ai' | 'user'; message: string };

type Props = {
  onComplete: (transcript: Transcript) => void;
  disabled?: boolean;
};

function pairTranscript(messages: Message[]): Transcript {
  const qa: Transcript = [];
  let pendingQ: string | null = null;
  for (const m of messages) {
    if (m.source === 'ai') pendingQ = m.message;
    else if (m.source === 'user' && pendingQ) {
      qa.push({ question: pendingQ, answer: m.message });
      pendingQ = null;
    }
  }
  return qa;
}

async function safeEnd(endSession: () => unknown) {
  try {
    const r = endSession();
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      await r;
    }
  } catch (e) {
    console.error('[voice] endSession error', e);
  }
}

function Inner({
  messages,
  error,
  onStart,
  onStop,
}: {
  messages: Message[];
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const { status } = useConversationStatus();
  const isConnected = status === 'connected';

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">
            Voice safety briefing
          </div>
          <div className="text-sm text-slate-500">
            ElevenLabs · multilingual ready · status: {status}
          </div>
        </div>
        {!isConnected ? (
          <button
            onClick={onStart}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-semibold"
          >
            Start briefing
          </button>
        ) : (
          <button
            onClick={onStop}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm font-semibold"
          >
            End briefing
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rose-900 rounded-lg p-3 text-sm mb-3">
          Error: {error}
        </div>
      )}

      {messages.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm ${
                m.source === 'ai'
                  ? 'bg-slate-800 text-slate-200'
                  : 'bg-slate-700 text-slate-100 ml-8'
              }`}
            >
              <div className="text-xs opacity-60 mb-1">
                {m.source === 'ai' ? 'Agent' : 'Worker'}
              </div>
              {m.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProvidedSession({ onComplete }: { onComplete: (t: Transcript) => void }) {
  const { startSession, endSession } = useConversationControls();
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const closingFiredRef = useRef(false);

  const start = async () => {
    setMessages([]);
    setError(null);
    messagesRef.current = [];
    closingFiredRef.current = false;
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await startSession({
        connectionType: 'webrtc',
        onConnect: ({ conversationId }) =>
          console.log('[voice] connected', conversationId),
        onDisconnect: () => {
          console.log('[voice] disconnected');
          const qa = pairTranscript(messagesRef.current);
          if (qa.length > 0) onComplete(qa);
        },
        onMessage: (msg: Message) => {
          console.log('[voice]', msg);
          setMessages((prev) => [...prev, msg]);
          if (
            msg.source === 'ai' &&
            !closingFiredRef.current &&
            /stand by for your fit.?for.?duty/i.test(msg.message)
          ) {
            closingFiredRef.current = true;
            console.log('[voice] closing phrase detected, ending in 2s');
            setTimeout(() => {
              safeEnd(endSession);
            }, 5000);
          }
        },
        onError: (m: string) => {
          console.error('[voice] error', m);
          setError(m);
        },
      });
    } catch (e) {
      setError(String(e));
    }
  };

  const stop = async () => {
    await safeEnd(endSession);
  };

  return <Inner messages={messages} error={error} onStart={start} onStop={stop} />;
}

export default function VoiceSession({ onComplete }: Props) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/voice-config')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAgentId(d.agentId);
        else setBootError(d.error || 'no agent id');
      })
      .catch((e) => setBootError(String(e)));
  }, []);

  if (bootError) {
    return (
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <div className="text-rose-400 text-sm">Voice config error: {bootError}</div>
      </div>
    );
  }

  if (!agentId) {
    return (
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
        <div className="text-slate-500 text-sm">Loading voice agent…</div>
      </div>
    );
  }

  return (
    <ConversationProvider agentId={agentId}>
      <ProvidedSession onComplete={onComplete} />
    </ConversationProvider>
  );
}
