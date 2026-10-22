import { create } from "zustand";

const TOAST_DURATION_MS = 6000;

export interface ToastState {
  text: string;
  undo?: () => void;
}

interface ToastStore {
  toast: ToastState | null;
  showToast: (text: string, undo?: () => void) => void;
  hideToast: () => void;
}

let dismissTimer: number | undefined;

/** Toast único, de 6s, no rodapé da área de conteúdo. `undo` só existe quando a ação é
 * realmente reversível (ver `ProjectsView.handleIgnoreProject`): não há comando de
 * restauração da Lixeira no backend, então limpezas reais não oferecem desfazer. */
export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  showToast: (text, undo) => {
    window.clearTimeout(dismissTimer);
    set({ toast: { text, undo } });
    dismissTimer = window.setTimeout(() => set({ toast: null }), TOAST_DURATION_MS);
  },
  hideToast: () => {
    window.clearTimeout(dismissTimer);
    set({ toast: null });
  },
}));
