import { ScanIcon } from "../icons/Icons";

export function ScanningAnimation({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-4 ${className}`} role="img" aria-label="Varredura em andamento">
      <div className="relative h-16 w-16">
        <span className="absolute inset-0 rounded-full border-2 border-shed/20" />
        <span className="absolute inset-0 rounded-full border-2 border-shed/40 [animation:ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-shed [animation:spin_2.5s_linear_infinite]" />
        <span className="absolute inset-0 flex items-center justify-center">
          <ScanIcon className="h-6 w-6 text-shed [animation:pulse_3s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
        </span>
      </div>
    </div>
  );
}
