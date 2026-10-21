import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";
import { applyThemeClass } from "./lib/theme";
import { useAppStore } from "./store/useAppStore";

const queryClient = new QueryClient();

applyThemeClass(useAppStore.getState().theme, document.documentElement);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
