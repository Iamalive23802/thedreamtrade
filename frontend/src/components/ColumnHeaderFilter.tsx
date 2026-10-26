import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Filter } from 'lucide-react';

type ColumnHeaderFilterProps = {
  label: string;
  value?: string;
  onClear?: () => void;
  children: ReactNode;
};

/**
 * Leads-style column header with a filter icon that opens a dropdown.
 */
const ColumnHeaderFilter = ({
  label,
  value,
  onClear,
  children,
}: ColumnHeaderFilterProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasValue = Boolean(value && String(value).trim() !== '');

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  return (
    <th className="p-3 text-xs relative normal-case">
      <div ref={ref} className="flex items-center gap-1 relative">
        <span className="uppercase tracking-wide">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`${hasValue ? 'text-amber-400' : 'text-gray-400'} hover:text-white`}
          title={`Filter ${label}`}
        >
          <Filter size={14} />
        </button>
        {open && (
          <div className="absolute left-0 mt-1 top-full z-30 bg-gray-900 border border-gray-700 rounded-xl p-2 shadow-lg min-w-[12rem]">
            {children}
            {hasValue && onClear && (
              <button
                type="button"
                onClick={onClear}
                className="mt-1 block text-xs text-gray-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    </th>
  );
};

export default ColumnHeaderFilter;
