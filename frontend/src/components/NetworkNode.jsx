import { useState } from 'react';
import { Handle, Position } from 'reactflow';

const NETWORK_FILL = {
  salesOrder: '#93C5FD',
  delivery: '#6EE7B7',
  billing: '#FCD34D',
  payment: '#C4B5FD',
  customer: '#D1D5DB',
};

/**
 * 14px circle — network view only. Tooltip on hover (id + type); no on-node labels.
 */
export function NetworkNode({ data, id }) {
  const fill = NETWORK_FILL[data.apiType] ?? '#D1D5DB';
  const [hover, setHover] = useState(false);

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent"
      />
      <div
        className="relative cursor-pointer"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {hover && (
          <div
            className="pointer-events-none absolute bottom-full left-1/2 z-[50] mb-1 -translate-x-1/2"
            role="tooltip"
          >
            <div className="min-w-[max-content] rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-left shadow-lg">
              <div className="font-mono text-[10px] leading-tight text-white">
                {id}
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-slate-300">
                {data.apiType ?? 'unknown'}
              </div>
            </div>
          </div>
        )}
        <div
          className="h-[14px] w-[14px] shrink-0 rounded-full border border-white/40 shadow-[0_1px_3px_rgba(15,23,42,0.25)]"
          style={{ backgroundColor: fill }}
        />
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent"
      />
    </>
  );
}
