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
        className="min-w-[160px] max-w-[260px] cursor-pointer rounded-lg border border-white/30 px-3 py-2.5 text-[13px] font-medium leading-snug text-white shadow-[0_4px_14px_rgba(15,23,42,0.22)]"
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
