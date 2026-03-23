import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

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
      const { data } = await axios.post('/api/chat', {
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
    <div className="flex min-h-0 min-w-0 flex-[2] flex-col bg-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-slate-800">
          Chat
        </h2>
        <p className="text-xs text-slate-500">
          Questions about orders, billing, and customers
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !loading && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center">
            <p className="text-sm leading-relaxed text-slate-600">
              Ask me anything about your SAP data — sales orders, deliveries,
              billing documents, payments, or customers.
            </p>
            <p className="text-sm leading-relaxed text-slate-600"></p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-800 shadow-sm'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.role === 'assistant' && m.sql != null && m.sql !== '' && (
                <details className="mt-2 border-t border-slate-100 pt-2 text-left">
                  <summary className="cursor-pointer text-[10px] font-medium text-slate-400 hover:text-slate-600">
                    SQL query
                  </summary>
                  <pre className="mt-1 max-h-36 overflow-auto rounded bg-slate-50 p-2 font-mono text-[10px] leading-snug text-slate-600">
                    {m.sql}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500 shadow-sm">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600"
                aria-hidden
              />
              <span>Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
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
            placeholder="Ask a question…"
            disabled={loading}
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim()}
            className="shrink-0 self-end rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
