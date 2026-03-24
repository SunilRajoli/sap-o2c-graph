import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import API_BASE from '../config';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { O2CNode } from './O2CNode.jsx';
import { NetworkNode } from './NetworkNode.jsx';
import { getNetworkLayout, layoutWithDagre } from '../graphLayout.js';
import {
  formatNodeDataEntry,
  humanizeKey,
  orderedDataKeys,
} from '../nodeDetailFormat.js';

const LEGEND_FLOW = [
  { type: 'salesOrder', label: 'Sales order', color: '#3B82F6' },
  { type: 'delivery', label: 'Delivery', color: '#10B981' },
  { type: 'billing', label: 'Billing', color: '#F59E0B' },
  { type: 'payment', label: 'Payment', color: '#8B5CF6' },
  { type: 'customer', label: 'Customer', color: '#6B7280' },
];

const LEGEND_NETWORK = [
  { type: 'salesOrder', label: 'Sales order', color: '#93C5FD' },
  { type: 'delivery', label: 'Delivery', color: '#6EE7B7' },
  { type: 'billing', label: 'Billing', color: '#FCD34D' },
  { type: 'payment', label: 'Payment', color: '#C4B5FD' },
  { type: 'customer', label: 'Customer', color: '#D1D5DB' },
];

/** Shared with ReactFlow `fitView` / `fitViewOptions` and manual fitView() calls */
const FIT_VIEW_OPTIONS = {
  padding: 0.05,
  includeHiddenNodes: false,
  minZoom: 0.1,
  maxZoom: 1.5,
};

function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <button
      type="button"
      onClick={() => fitView(FIT_VIEW_OPTIONS)}
      className="pointer-events-auto rounded-md border border-slate-200/90 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      Fit View
    </button>
  );
}

const MODE_SWITCH_FIT = { padding: 0.1, duration: 600 };

/** Re-fit after mode switch so the new layout is visible (delay lets nodes render). */
function FitViewOnViewModeChange({ viewMode }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => {
      fitView(MODE_SWITCH_FIT);
    }, 200);
    return () => clearTimeout(t);
  }, [viewMode, fitView]);
  return null;
}

/**
 * Toggle view mode and re-fit viewport (same delay/options as FitViewOnViewModeChange).
 * @param {object} props
 * @param {'network' | 'flow'} props.viewMode
 * @param {() => void} props.onToggleViewMode
 */
function ViewModeToggle({ viewMode, onToggleViewMode }) {
  const { fitView } = useReactFlow();
  return (
    <button
      type="button"
      onClick={() => {
        onToggleViewMode();
        setTimeout(() => {
          fitView(MODE_SWITCH_FIT);
        }, 200);
      }}
      className="pointer-events-auto rounded-md border border-slate-200/90 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      {viewMode === 'network'
        ? 'Switch to Flow View'
        : 'Switch to Network View'}
    </button>
  );
}

/**
 * @param {Array<{ id: string, source: string, target: string, label?: string }>} rawEdges
 */
function buildNetworkEdges(rawEdges) {
  return rawEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'default',
    style: { stroke: '#93C5FD', strokeWidth: 1, opacity: 0.5 },
  }));
}

/**
 * @param {Array<{ id: string, source: string, target: string, label?: string }>} rawEdges
 */
function buildFlowEdges(rawEdges) {
  return rawEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    label: e.label ?? '',
    labelStyle: { fontSize: 11, fill: '#334155', fontWeight: 500 },
    labelBgStyle: { fill: '#F8FAFC', fillOpacity: 0.95 },
    labelShowBg: true,
    style: { stroke: '#94A3B8', strokeWidth: 1.5 },
  }));
}

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

/**
 * @param {object} props
 * @param {(sel: null | { id: string, label?: string, apiType?: string, nodeData: Record<string, unknown> }) => void} props.onNodeSelect
 * @param {'network' | 'flow'} props.viewMode
 * @param {() => void} props.onToggleViewMode
 */
function GraphCanvas({ onNodeSelect, viewMode, onToggleViewMode }) {
  const nodeTypes = useMemo(
    () => ({
      o2c: O2CNode,
      network: NetworkNode,
    }),
    [],
  );

  const [graphData, setGraphData] = useState(
    /** @type {{ rawNodes: import('reactflow').Node[], rawEdges: import('reactflow').Edge[] } | null} */ (
      null
    ),
  );
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const legendItems = viewMode === 'network' ? LEGEND_NETWORK : LEGEND_FLOW;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get(`${API_BASE}/api/graph`);
        if (cancelled) return;

        const rawNodes = (data.nodes ?? []).map((n) => ({
          id: n.id,
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
        }));

        setGraphData({ rawNodes, rawEdges });
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
  }, []);

  useEffect(() => {
    if (!graphData) return;

    const { rawNodes, rawEdges } = graphData;

    const baseNodes = rawNodes.map((n) => ({
      ...n,
      type: viewMode === 'network' ? 'network' : 'o2c',
    }));

    if (viewMode === 'network') {
      const laidOut = getNetworkLayout(baseNodes, rawEdges);
      setNodes(laidOut.map((n) => ({ ...n, type: 'network' })));
      setEdges(buildNetworkEdges(rawEdges));
    } else {
      const laidOut = layoutWithDagre(baseNodes, rawEdges);
      setNodes(laidOut.map((n) => ({ ...n, type: 'o2c' })));
      setEdges(buildFlowEdges(rawEdges));
    }
  }, [graphData, viewMode, setNodes, setEdges]);

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
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.1}
        maxZoom={1.5}
        className="h-full w-full bg-slate-50"
      >
        <FitViewOnViewModeChange viewMode={viewMode} />
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[min(100%,calc(100%-1.5rem))] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-200/90 bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Legend
              </span>
              {legendItems.map((item) => (
                <span
                  key={item.type}
                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-700"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full shadow-sm ring-1 ring-black/5"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
            <ViewModeToggle
              viewMode={viewMode}
              onToggleViewMode={onToggleViewMode}
            />
          </div>
          <FitViewButton />
        </div>
        <Background gap={20} size={1} color="#E2E8F0" />
        <Controls
          position="bottom-right"
          fitViewOptions={FIT_VIEW_OPTIONS}
          className="!m-3 !overflow-hidden !rounded-lg !border !border-slate-200 !bg-white !shadow-sm"
        />
      </ReactFlow>
    </div>
  );
}

export function GraphPanel() {
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState(
    /** @type {'network' | 'flow'} */ ('network'),
  );

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === 'network' ? 'flow' : 'network'));
  }, []);

  const dataKeys = useMemo(() => {
    if (!selected?.nodeData || typeof selected.nodeData !== 'object') return [];
    return orderedDataKeys(/** @type {Record<string, unknown>} */ (selected.nodeData));
  }, [selected]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col bg-white">
      <div className="relative min-h-0 flex-1">
        <ReactFlowProvider>
          <GraphCanvas
            viewMode={viewMode}
            onToggleViewMode={toggleViewMode}
            onNodeSelect={setSelected}
          />
        </ReactFlowProvider>

        {selected && (
          <aside
            className="node-detail-panel absolute bottom-4 left-4 z-30 flex max-h-[min(420px,48vh)] w-[min(360px,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white text-left shadow-[0_12px_40px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/5"
            aria-label="Node details"
          >
            <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Node
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {selected.label}
              </p>
              <p className="text-[11px] text-slate-500">{selected.apiType}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {dataKeys.length > 0 && (
                <>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
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
                <p className="text-[11px] text-slate-400">No data fields</p>
              )}
            </div>
            <div className="shrink-0 border-t border-slate-100 p-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-full rounded-md border border-slate-200 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
