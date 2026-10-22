import { useToastStore } from "../../store/useToastStore";

export function Toast() {
  const toast = useToastStore((state) => state.toast);
  const hideToast = useToastStore((state) => state.hideToast);

  if (!toast) {
    return null;
  }

  return (
    <div
      role="status"
      className="absolute bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md bg-ink py-1.5 pr-1.5 pl-3.5 whitespace-nowrap text-canvas shadow-pop"
    >
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            toast.undo?.();
            hideToast();
          }}
          className="h-[26px] rounded-sm px-2.5 text-[13px] font-semibold text-canvas underline underline-offset-[3px]"
        >
          Desfazer
        </button>
      )}
    </div>
  );
}
