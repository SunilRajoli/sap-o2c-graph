import dagre from 'dagre';

/** Match O2CNode min width (~160px) + padding for dagre layout */
const NODE_WIDTH = 200;
const NODE_HEIGHT = 52;

/** 14px diameter network nodes — half for top-left offset from cluster center */
const NETWORK_RADIUS = 7;

/**
 * Flow view: left-to-right structured layout.
 * @param {{ id: string }[]} nodes
 * @param {{ id: string, source: string, target: string }[]} edges
 */
export function layoutWithDagre(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    ranksep: 80,
    nodesep: 30,
    marginx: 24,
    marginy: 24,
  });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) {
      return {
        ...n,
        position: { x: 0, y: 0 },
        sourcePosition: 'right',
        targetPosition: 'left',
      };
    }
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    };
  });
}

/**
 * Network view: organic clusters by entity type (no dagre).
 * Positions are stable per node id (seeded angle/radius).
 *
 * @param {import('reactflow').Node[]} nodes
 * @param {unknown} [_edges] Unused; kept for call-site symmetry
 */
export function getNetworkLayout(nodes, _edges) {
  const width = 900;
  const height = 600;
  const centerX = width / 2;
  const centerY = height / 2;

  const groups = {
    customer: [],
    salesOrder: [],
    delivery: [],
    billing: [],
    payment: [],
  };

  nodes.forEach((node) => {
    const t = node.data?.apiType;
    if (t && groups[t]) {
      groups[t].push(node);
    }
  });

  const zones = {
    customer: { cx: 100, cy: 300 },
    salesOrder: { cx: 250, cy: 300 },
    delivery: { cx: 450, cy: 300 },
    billing: { cx: 650, cy: 300 },
    payment: { cx: 850, cy: 300 },
  };

  return nodes.map((node) => {
    const t = node.data?.apiType;
    const zone = (t && zones[t]) || { cx: centerX, cy: centerY };

    const seed = node.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const angle = ((seed * 137.5) % 360) * (Math.PI / 180);
    const radius = 40 + (seed % 180);

    const cx = zone.cx + Math.cos(angle) * radius;
    const cy = zone.cy + Math.sin(angle) * radius;

    return {
      ...node,
      position: {
        x: cx - NETWORK_RADIUS,
        y: cy - NETWORK_RADIUS,
      },
      sourcePosition: 'bottom',
      targetPosition: 'top',
    };
  });
}
