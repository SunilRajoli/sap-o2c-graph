import { GraphPanel } from './components/GraphPanel.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';

export default function App() {
  return (
    <div className="flex h-screen min-h-0 w-full divide-x divide-slate-200 overflow-hidden bg-white text-slate-900 antialiased">
      <GraphPanel />
      <ChatPanel />
    </div>
  );
}
