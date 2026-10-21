interface ProgressBarProps {
  percent: number;
  className?: string;
}

export function ProgressBar({ percent, className = "" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10 ${className}`}
    >
      <div
        className="h-full rounded-full bg-amber-500 transition-[width] duration-200 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
