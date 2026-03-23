import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { O2CNode } from './O2CNode.jsx';
import { layoutWithDagre } from '../graphLayout.js';
import {
  formatNodeDataEntry,
  humanizeKey,
  orderedDataKeys,
} from '../nodeDetailFormat.js';

const LEGEND = [
  { type: 'salesOrder', label: 'Sales order', color: '#3B82F6' },
  { type: 'delivery', label: 'Delivery', color: '#10B981' },
  { type: 'billing', label: 'Billing', color: '#F59E0B' },
  { type: 'payment', label: 'Payment', color: '#8B5CF6' },
  { type: 'customer', label: 'Customer', color: '#6B7280' },
];

function GraphSkeleton() {
  return (
    <div
      className="flex h-full flex-col gap-3 p-6"
      role="status"
      aria-label="Loading graph"
    >
      <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
      <div className="flex flex-1 gap-3">
        <div className="flex flex-1 flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-4">
          <div className="h-3 w-[min(200px,75%)] animate-pulse rounded bg-slate-200" />
          <div className="mt-4 grid flex-1 grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] animate-pulse rounded-lg bg-slate-200/80"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Loading graph data…</span>
    </div>
  );
}

function GraphCanvas({ onNodeSelect }) {
  const nodeTypes = useMemo(
    () => ({
      o2c: O2CNode,
    }),
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get('/api/graph');
        if (cancelled) return;

        const rawNodes = (data.nodes ?? []).map((n) => ({
          id: n.id,
          type: 'o2c',
          data: {
            label: n.label,
            apiType: n.type,
            nodeData: n.data && typeof n.data === 'object' ? n.data : {},
          },
        }));

        const rawEdges = (data.edges ?? []).map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: false,
          style: { stroke: '#94A3B8', strokeWidth: 1.5 },
        }));

        const laidOut = layoutWithDagre(rawNodes, rawEdges);
        setNodes(laidOut);
        setEdges(rawEdges);
        setError(null);
      } catch (e) {
        console.error(e);
        const msg =
          e?.response?.data?.error ??
          e?.message ??
          'Could not load graph. Is the API running on port 3001?';
        setError(typeof msg === 'string' ? msg : 'Failed to load graph.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_, node) => {
      onNodeSelect({
        id: node.id,
        label: node.data?.label,
        apiType: node.data?.apiType,
        nodeData: node.data?.nodeData ?? {},
      });
    },
    [onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const onInit = useCallback((instance) => {
    instance.fitView({ padding: 0.15, maxZoom: 1.2 });
  }, []);

  if (loading) {
    return <GraphSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-600">
        {error}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onInit={onInit}
        nodeTypes={nodeTypes}
        minZoom={0.15}
        maxZoom={1.5}
        className="bg-slate-50"
      >
        <Background gap={20} size={1} color="#E2E8F0" />
        <Controls className="!m-3 !overflow-hidden !rounded-lg !border !border-slate-200 !bg-white !shadow-sm" />
      </ReactFlow>

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Legend
        </p>
        <ul className="space-y-1">
          {LEGEND.map((item) => (
            <li
              key={item.type}
              className="flex items-center gap-2 text-[11px] text-slate-700"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function GraphPanel() {
  const [selected, setSelected] = useState(null);

  const dataKeys = useMemo(() => {
    if (!selected?.nodeData || typeof selected.nodeData !== 'object') return [];
    return orderedDataKeys(/** @type {Record<string, unknown>} */ (selected.nodeData));
  }, [selected]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-[3] flex-col bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-tight text-slate-800">
          Order-to-cash graph
        </h1>
        <p className="text-xs text-slate-500">
          Pan, zoom, and click a node for details
        </p>
      </div>

      <div className="relative min-h-0 flex-1">
        <ReactFlowProvider>
          <GraphCanvas onNodeSelect={setSelected} />
        </ReactFlowProvider>

        {selected && (
          <div className="absolute right-4 top-4 z-10 w-64 max-h-[min(420px,70%)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Node
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-900">
              {selected.label}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">{selected.apiType}</p>
            {dataKeys.length > 0 && (
              <>
                <p className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Data
                </p>
                <dl className="space-y-2 text-[11px]">
                  {dataKeys.map((key) => {
                    const raw = /** @type {Record<string, unknown>} */ (
                      selected.nodeData
                    )[key];
                    const display = formatNodeDataEntry(
                      key,
                      raw,
                      /** @type {Record<string, unknown>} */ (selected.nodeData),
                    );
                    return (
                      <div
                        key={key}
                        className="border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                      >
                        <dt className="font-medium text-slate-600">
                          {humanizeKey(key)}
                        </dt>
                        <dd className="mt-0.5 break-words text-slate-900">
                          {display}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </>
            )}
            {dataKeys.length === 0 && (
              <p className="mt-2 text-[11px] text-slate-400">No data fields</p>
            )}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-3 w-full rounded border border-slate-200 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
