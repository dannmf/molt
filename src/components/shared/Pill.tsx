import type { ReactNode } from "react";

interface PillProps {
  className?: string;
  title?: string;
  children: ReactNode;
}

export function Pill({ className = "", title, children }: PillProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${className}`}
    >
      {children}
    </span>
  );
}
