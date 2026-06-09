'use client';

export default function StaffBookingOverrides({
  slot,
  labels,
  blockMins,
  onOutsideHoursChange,
  onExtendedChange,
  compact = false,
}) {
  const wrap = compact
    ? 'space-y-2'
    : 'bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3';

  return (
    <div className={wrap}>
      {!compact && (
        <p className="text-[9px] font-black uppercase text-amber-900 tracking-wide">
          {labels.staffOverridesTitle}
        </p>
      )}
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={!!slot?.outside_normal_hours}
          onChange={(e) => onOutsideHoursChange(e.target.checked)}
          className="w-4 h-4 mt-0.5 shrink-0"
        />
        <span>
          <span className="block text-xs font-black uppercase text-amber-950 group-hover:text-amber-800">
            {labels.outsideNormalHours}
          </span>
          <span className="block text-[9px] font-bold text-amber-800/80 mt-0.5 leading-snug">
            {labels.outsideNormalHoursHint}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={!!slot?.extended_session}
          onChange={(e) => onExtendedChange(e.target.checked)}
          className="w-4 h-4 mt-0.5 shrink-0"
        />
        <span>
          <span className="block text-xs font-black uppercase text-amber-950 group-hover:text-amber-800">
            {labels.extendedSession}
          </span>
          <span className="block text-[9px] font-bold text-amber-800/80 mt-0.5 leading-snug">
            {labels.extendedSessionHint}
          </span>
        </span>
      </label>
      <p className="text-[9px] font-black text-amber-900 uppercase">
        {labels.totalBlock}: {blockMins} min
      </p>
    </div>
  );
}
