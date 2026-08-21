import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import moment, { type Moment } from 'moment';

export type DatePreset = 'daily' | 'weekly' | 'monthly' | 'custom';

type MetaDateRangePickerProps = {
  preset: DatePreset;
  from: string;
  to: string;
  onChange: (next: { preset: DatePreset; from: string; to: string }) => void;
};

const PRESETS: { key: DatePreset; label: string; hint: string }[] = [
  { key: 'daily', label: 'Today', hint: 'Daily' },
  { key: 'weekly', label: 'Last 7 days', hint: 'Weekly' },
  { key: 'monthly', label: 'Last 30 days', hint: 'Monthly' },
  { key: 'custom', label: 'Custom', hint: 'Pick range' },
];

function rangeForPreset(preset: DatePreset, from?: string, to?: string) {
  const end = moment().endOf('day');
  if (preset === 'daily') {
    return { from: moment().startOf('day'), to: end };
  }
  if (preset === 'weekly') {
    return { from: moment().subtract(6, 'days').startOf('day'), to: end };
  }
  if (preset === 'monthly') {
    return { from: moment().subtract(29, 'days').startOf('day'), to: end };
  }
  const start = moment(from || undefined).startOf('day');
  const finish = moment(to || undefined).endOf('day');
  if (!start.isValid() || !finish.isValid()) {
    return { from: moment().subtract(6, 'days').startOf('day'), to: end };
  }
  return start.isAfter(finish)
    ? { from: finish.clone().startOf('day'), to: start.clone().endOf('day') }
    : { from: start, to: finish };
}

function buildMonthMatrix(month: Moment) {
  const start = month.clone().startOf('month').startOf('week');
  const end = month.clone().endOf('month').endOf('week');
  const days: Moment[] = [];
  const cursor = start.clone();
  while (cursor.isSameOrBefore(end, 'day')) {
    days.push(cursor.clone());
    cursor.add(1, 'day');
  }
  return days;
}

export default function MetaDateRangePicker({
  preset,
  from,
  to,
  onChange,
}: MetaDateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftPreset, setDraftPreset] = useState<DatePreset>(preset);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => moment(to || undefined).startOf('month'));

  useEffect(() => {
    if (!open) return;
    setDraftPreset(preset);
    setDraftFrom(from);
    setDraftTo(to);
    setPickingEnd(false);
    setHoverDay(null);
    setViewMonth(moment(to || undefined).startOf('month'));
  }, [open, preset, from, to]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const appliedRange = useMemo(() => rangeForPreset(preset, from, to), [preset, from, to]);
  const draftRange = useMemo(
    () => rangeForPreset(draftPreset, draftFrom, draftTo),
    [draftPreset, draftFrom, draftTo]
  );

  const monthDays = useMemo(() => buildMonthMatrix(viewMonth), [viewMonth]);
  const nextMonth = useMemo(() => viewMonth.clone().add(1, 'month'), [viewMonth]);
  const nextMonthDays = useMemo(() => buildMonthMatrix(nextMonth), [nextMonth]);

  const triggerLabel = useMemo(() => {
    const start = appliedRange.from.format('MMM D, YYYY');
    const end = appliedRange.to.format('MMM D, YYYY');
    if (preset === 'daily') return `Today: ${end}`;
    if (appliedRange.from.isSame(appliedRange.to, 'day')) return start;
    return `${start} – ${end}`;
  }, [appliedRange, preset]);

  const applyPreset = (next: DatePreset) => {
    setDraftPreset(next);
    if (next === 'custom') {
      setPickingEnd(false);
      return;
    }
    const range = rangeForPreset(next);
    const fromValue = range.from.format('YYYY-MM-DD');
    const toValue = range.to.format('YYYY-MM-DD');
    setDraftFrom(fromValue);
    setDraftTo(toValue);
    setPickingEnd(false);
    setHoverDay(null);
    onChange({ preset: next, from: fromValue, to: toValue });
    setOpen(false);
  };

  const onDayClick = (day: Moment) => {
    if (day.isAfter(moment(), 'day')) return;
    const value = day.format('YYYY-MM-DD');
    setDraftPreset('custom');

    if (!pickingEnd || !draftFrom) {
      setDraftFrom(value);
      setDraftTo(value);
      setPickingEnd(true);
      setHoverDay(null);
      return;
    }

    const start = moment(draftFrom);
    if (day.isBefore(start, 'day')) {
      setDraftFrom(value);
      setDraftTo(start.format('YYYY-MM-DD'));
    } else {
      setDraftTo(value);
    }
    setPickingEnd(false);
    setHoverDay(null);
  };

  const isInDraftRange = (day: Moment) => {
    const start = moment(draftFrom).startOf('day');
    let end = moment(draftTo).startOf('day');
    if (pickingEnd && hoverDay) {
      const hover = moment(hoverDay);
      if (hover.isBefore(start, 'day')) {
        return day.isBetween(hover, start, 'day', '[]');
      }
      return day.isBetween(start, hover, 'day', '[]');
    }
    if (!start.isValid() || !end.isValid()) return false;
    if (start.isAfter(end)) {
      const tmp = start.clone();
      // swap visually
      return day.isBetween(end, tmp, 'day', '[]');
    }
    return day.isBetween(start, end, 'day', '[]');
  };

  const isRangeEdge = (day: Moment) => {
    const start = moment(draftFrom);
    const end = moment(pickingEnd && hoverDay ? hoverDay : draftTo);
    if (!start.isValid()) return false;
    if (day.isSame(start, 'day')) return true;
    if (end.isValid() && day.isSame(end, 'day')) return true;
    return false;
  };

  const apply = () => {
    const range = rangeForPreset(draftPreset, draftFrom, draftTo);
    onChange({
      preset: draftPreset,
      from: range.from.format('YYYY-MM-DD'),
      to: range.to.format('YYYY-MM-DD'),
    });
    setOpen(false);
  };

  const renderMonth = (month: Moment, days: Moment[]) => (
    <div className="w-[260px]">
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-700 text-gray-300"
          onClick={() => setViewMonth((m) => m.clone().subtract(1, 'month'))}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-semibold text-white">{month.format('MMMM YYYY')}</p>
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-700 text-gray-300"
          onClick={() => setViewMonth((m) => m.clone().add(1, 'month'))}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
          <div key={`${month.format('YYYY-MM')}-${d}`} className="text-center text-[11px] text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = day.month() === month.month();
          const disabled = day.isAfter(moment(), 'day');
          const selected = isRangeEdge(day);
          const inRange = isInDraftRange(day);
          return (
            <button
              key={day.format('YYYY-MM-DD')}
              type="button"
              disabled={disabled || !inMonth}
              onClick={() => onDayClick(day)}
              onMouseEnter={() => {
                if (pickingEnd && inMonth && !disabled) setHoverDay(day.format('YYYY-MM-DD'));
              }}
              className={[
                'h-9 rounded-md text-xs transition relative',
                !inMonth ? 'text-transparent cursor-default' : '',
                disabled && inMonth ? 'text-gray-600 cursor-not-allowed' : '',
                inMonth && !disabled && !selected ? 'text-gray-200 hover:bg-gray-700' : '',
                inRange && inMonth && !selected ? 'bg-emerald-500/20 text-emerald-100' : '',
                selected ? 'bg-emerald-600 text-white font-semibold' : '',
              ].join(' ')}
            >
              {inMonth ? day.date() : ''}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 hover:bg-gray-750 px-3 py-2 text-sm text-white shadow-sm"
      >
        <CalendarDays size={16} className="text-gray-300" />
        <span>{triggerLabel}</span>
        <span className="text-[11px] uppercase tracking-wide text-gray-400 border-l border-gray-600 pl-2">
          {PRESETS.find((p) => p.key === preset)?.hint || 'Custom'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-[min(92vw,720px)] rounded-xl border border-gray-600 bg-gray-900 shadow-2xl overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <div className="md:w-44 border-b md:border-b-0 md:border-r border-gray-700 p-2 bg-gray-950/40">
              {PRESETS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => applyPreset(item.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm mb-1 transition ${
                    draftPreset === item.key
                      ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-600/40'
                      : 'text-gray-300 hover:bg-gray-800 border border-transparent'
                  }`}
                >
                  <div className="font-medium">{item.label}</div>
                  <div className="text-[11px] text-gray-500">{item.hint}</div>
                </button>
              ))}
            </div>

            <div className="flex-1 p-4">
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                {renderMonth(viewMonth, monthDays)}
                <div className="hidden sm:block">
                  {renderMonth(nextMonth, nextMonthDays)}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-gray-400">
                  {draftPreset === 'custom' && pickingEnd
                    ? 'Select end date'
                    : `${draftRange.from.format('MMM D, YYYY')} – ${draftRange.to.format('MMM D, YYYY')}`}
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-md bg-gray-800 text-gray-200 hover:bg-gray-700"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={apply}
                  >
                    Update
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
