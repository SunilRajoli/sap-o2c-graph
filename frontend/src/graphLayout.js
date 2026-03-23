import dagre from 'dagre';

const NODE_WIDTH = 190;
const NODE_HEIGHT = 48;

/**
 * @param {{ id: string }[]} nodes
 * @param {{ id: string, source: string, target: string }[]} edges
 */
export function layoutWithDagre(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: 48,
    ranksep: 72,
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
