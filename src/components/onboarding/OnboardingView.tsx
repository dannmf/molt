import { useState } from "react";

import { pickFolder } from "../../api/client";
import { useScan } from "../../hooks/useScan";
import { useAppStore } from "../../store/useAppStore";
import { ChevronDownIcon, ChevronUpIcon, FolderIcon, ScanIcon, XIcon } from "../icons/Icons";
import { ProgressBar } from "../shared/ProgressBar";
import { ScanningAnimation } from "../shared/ScanningAnimation";

export function OnboardingView() {
  const roots = useAppStore((state) => state.roots);
  const addRoot = useAppStore((state) => state.addRoot);
  const removeRoot = useAppStore((state) => state.removeRoot);
  const markScanned = useAppStore((state) => state.markScanned);
  const excludedPaths = useAppStore((state) => state.excludedPaths);
  const includePath = useAppStore((state) => state.includePath);
  const { scan, isScanning, isError, progressPct } = useScan();
  const [customRoot, setCustomRoot] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);

  function handleAddCustom() {
    const trimmed = customRoot.trim();
    if (trimmed.length === 0) {
      return;
    }
    addRoot(trimmed);
    setCustomRoot("");
  }

  async function handleBrowse() {
    const picked = await pickFolder();
    if (picked) {
      addRoot(picked);
    }
  }

  function handleStart() {
    scan(roots, { onSuccess: () => markScanned() });
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Bem-vindo ao Molt</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          O Molt varre as pastas que você escolher em busca de projetos de código, mede o espaço ocupado por
          artefatos regeneráveis (como <code className="text-xs">node_modules</code> e <code className="text-xs">target</code>) e
          mostra o que pode ser liberado.
        </p>

        <div className="mt-6 space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-3 text-sm text-neutral-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-400">
          <p>Nada é apagado direto do disco: toda limpeza vai para a Lixeira do macOS e pode ser desfeita.</p>
          <p>
            Para detectar caches de ferramentas como Xcode e simuladores, o macOS pode pedir Acesso Total ao Disco em
            Ajustes do Sistema → Privacidade e Segurança.
          </p>
        </div>

        <h2 className="mt-6 text-sm font-medium text-neutral-700 dark:text-neutral-300">Pastas raiz da varredura</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {roots.map((root) => (
            <li
              key={root}
              className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-neutral-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300"
            >
              {root}
              <button
                type="button"
                onClick={() => removeRoot(root)}
                aria-label={`Remover ${root}`}
                className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
          {roots.length === 0 && <li className="text-sm text-neutral-500">Nenhuma pasta selecionada.</li>}
        </ul>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={customRoot}
            onChange={(event) => setCustomRoot(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleAddCustom()}
            placeholder="/Users/voce/outra-pasta"
            className="flex-1 rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm outline-none focus:border-amber-500 dark:border-white/10 dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            Adicionar
          </button>
          <button
            type="button"
            onClick={() => void handleBrowse()}
            className="flex items-center gap-1.5 rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-black/5 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            <FolderIcon className="h-4 w-4" />
            Procurar
          </button>
        </div>

        {excludedPaths.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowIgnored((value) => !value)}
              aria-expanded={showIgnored}
              className="flex w-full items-center justify-between text-sm font-medium text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              Pastas ignoradas ({excludedPaths.length})
              {showIgnored ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </button>
            {showIgnored && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {excludedPaths.map((path) => (
                  <li
                    key={path}
                    className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-neutral-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300"
                  >
                    {path}
                    <button
                      type="button"
                      onClick={() => includePath(path)}
                      aria-label={`Parar de ignorar ${path}`}
                      className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={roots.length === 0 || isScanning}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:bg-amber-700"
        >
          <ScanIcon className="h-4 w-4" />
          {isScanning ? "Varrendo..." : "Começar varredura"}
        </button>

        {isScanning && (
          <div className="mt-3">
            <ScanningAnimation />
            <ProgressBar percent={progressPct} />
          </div>
        )}
        {isError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">A varredura falhou. Tente novamente.</p>}
      </div>
    </div>
  );
}
