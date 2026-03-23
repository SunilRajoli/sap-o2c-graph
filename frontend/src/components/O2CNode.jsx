import { Handle, Position } from 'reactflow';

const TYPE_COLORS = {
  salesOrder: '#3B82F6',
  delivery: '#10B981',
  billing: '#F59E0B',
  payment: '#8B5CF6',
  customer: '#6B7280',
};

export function O2CNode({ data }) {
  const bg = TYPE_COLORS[data.apiType] ?? '#6B7280';

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-white/50"
      />
      <div
        className="min-w-[130px] max-w-[220px] rounded-lg border border-white/25 px-3 py-2 text-xs font-medium text-white shadow-sm"
        style={{ backgroundColor: bg }}
        title={data.label}
      >
        <div className="truncate">{data.label}</div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-white/50"
      />
    </>
  );
}
