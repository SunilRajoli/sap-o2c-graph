import { GraphPanel } from './components/GraphPanel.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';

export default function App() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-100 text-slate-900 antialiased">
      <header className="flex h-12 w-full shrink-0 items-center border-b border-slate-800/50 bg-[#0f172a] px-4">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-white">
            SAP O2C Graph
          </h1>
          <p className="text-[11px] leading-tight text-slate-400">
            Order to Cash Dataset
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
        <div className="relative min-h-0 h-full w-[65%] min-w-0 overflow-hidden border-r border-slate-200">
          <GraphPanel />
        </div>
        <div className="flex min-h-0 h-full w-[35%] min-w-0 flex-col overflow-hidden">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
