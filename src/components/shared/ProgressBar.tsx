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
      className={`h-[3px] w-full overflow-hidden rounded-full bg-line ${className}`}
    >
      <div className="h-full bg-shed transition-[width] duration-200 ease-out" style={{ width: `${clamped}%` }} />
    </div>
  );
}
