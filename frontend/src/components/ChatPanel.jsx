import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import API_BASE from '../config';

function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-100 px-3 py-2.5"
      role="status"
      aria-label="Assistant is typing"
    >
      <div className="typing-dots flex items-center gap-1" aria-hidden>
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-500" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-500" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-500" />
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    setInput('');
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: 'user', content: text },
    ]);
    setLoading(true);

    try {
      const { data } = await axios.post(`${API_BASE}/api/chat`, {
        message: text,
        conversationHistory: history,
      });
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer ?? '',
          sql: data.sql ?? null,
        },
      ]);
    } catch (e) {
      const msg =
        e?.response?.data?.error ??
        e?.message ??
        'Request failed. Is the API running?';
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: typeof msg === 'string' ? msg : 'Request failed.',
          sql: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-white">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
            <p className="text-sm leading-relaxed text-slate-600">
              Ask about sales orders, deliveries, billing documents, payments,
              or customers in your SAP Order-to-Cash data.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[10px] font-bold tracking-tight text-white ring-2 ring-white"
                aria-hidden
              >
                AI
              </div>
            )}
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#0f172a] text-white shadow-sm'
                  : 'border border-slate-200/80 bg-slate-100 text-slate-800'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.role === 'assistant' && m.sql != null && m.sql !== '' && (
                <details className="mt-2 border-t border-slate-200/80 pt-2 text-left">
                  <summary className="cursor-pointer text-[10px] font-medium text-slate-500 hover:text-slate-700">
                    SQL query
                  </summary>
                  <pre className="mt-1 max-h-36 overflow-auto rounded-md bg-white/80 p-2 font-mono text-[10px] leading-snug text-slate-600">
                    {m.sql}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start gap-2">
            <div
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0f172a] text-[10px] font-bold tracking-tight text-white ring-2 ring-white"
              aria-hidden
            >
              AI
            </div>
            <TypingIndicator />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-4 pt-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Ask a question about the dataset…"
            disabled={loading}
            className="min-h-[48px] flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 outline-none ring-0 transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200/80 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim()}
            className="shrink-0 self-end rounded-lg bg-[#0f172a] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
