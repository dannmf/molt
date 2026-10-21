import { useEffect } from "react";

import { applyThemeClass, THEME_STORAGE_KEY } from "../lib/theme";
import { useAppStore } from "../store/useAppStore";

export function useThemeSync() {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    applyThemeClass(theme, document.documentElement);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);
}
