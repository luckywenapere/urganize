export function ReadinessBar({ value, showTicks = true }: { value: number; showTicks?: boolean }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value || 0)));

  return (
    <div className="relative">
      <div className="relative h-1.5 w-full bg-white/5 rounded-sm overflow-hidden">
        <div 
          className="h-full bg-brand transition-[width] duration-700 ease-out" 
          style={{ width: `${safeValue}%` }} 
        />
      </div>
      {showTicks && (
        <div className="absolute -top-1 left-0 h-1 w-full pointer-events-none">
          <div className="absolute left-1/4 h-full w-px bg-white/20" />
          <div className="absolute left-2/4 h-full w-px bg-white/20" />
          <div className="absolute left-3/4 h-full w-px bg-white/20" />
        </div>
      )}
    </div>
  );
}
