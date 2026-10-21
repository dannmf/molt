interface SpinnerProps {
  className?: string;
}

export function Spinner({ className = "h-5 w-5" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`inline-block animate-spin rounded-full border-2 border-black/10 border-t-blue-500 dark:border-white/10 dark:border-t-blue-400 ${className}`}
    />
  );
}
