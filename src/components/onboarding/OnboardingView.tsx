import { useState } from "react";

import { pickFolder } from "../../api/client";
import { useScan } from "../../hooks/useScan";
import type { RootScanState } from "../../lib/scanRootProgress";
import { useAppStore } from "../../store/useAppStore";
import { ChevronDownIcon, ChevronUpIcon, FolderIcon, ScanIcon } from "../icons/Icons";
import { ProgressBar } from "../shared/ProgressBar";

function ScanningView({
  rootCount,
  projectsFound,
  progressPct,
  currentPath,
  rootProgress,
}: {
  rootCount: number;
  projectsFound: number;
  progressPct: number;
  currentPath: string;
  rootProgress: RootScanState[];
}) {
  return (
    <div>
      <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.01em] text-ink">Varrendo pastas</h1>
      <p className="mt-2 text-[14.5px] leading-[23px] text-ink-2">
        {rootCount} {rootCount === 1 ? "pasta raiz" : "pastas raiz"} · Lixeira do macOS como destino
      </p>

      <div className="mt-9">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.02em] text-ink">
              {projectsFound}
            </span>
            <span className="text-[14px] text-ink-2">projetos encontrados</span>
          </div>
          <span className="font-mono text-[13px] text-ink-2">{progressPct}%</span>
        </div>
        <div className="mt-3">
          <ProgressBar percent={progressPct} />
        </div>
        <p className="mt-2.5 truncate font-mono text-[11.5px] text-ink-3">{currentPath}</p>
      </div>

      <div className="mt-9">
        <h2 className="text-sm font-semibold text-ink">Pastas raiz da varredura</h2>
        <ul className="mt-2 border-t border-line">
          {rootProgress.map(({ root, status, projects }) => (
            <li key={root} className="flex h-9 items-center justify-between gap-3 border-b border-line">
              <span className="truncate font-mono text-[12.5px] text-ink">{root}</span>
              {status === "waiting" ? (
                <span className="shrink-0 text-xs text-ink-3">aguardando</span>
              ) : (
                <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-ink-2">
                  <span
                    aria-hidden="true"
                    className={`size-1.5 shrink-0 rounded-full ${status === "scanning" ? "animate-pulse bg-shed" : "bg-ink-3"}`}
                  />
                  {projects} {projects === 1 ? "projeto" : "projetos"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function OnboardingView() {
  const roots = useAppStore((state) => state.roots);
  const addRoot = useAppStore((state) => state.addRoot);
  const removeRoot = useAppStore((state) => state.removeRoot);
  const markScanned = useAppStore((state) => state.markScanned);
  const hasScanned = useAppStore((state) => state.hasScanned);
  const excludedPaths = useAppStore((state) => state.excludedPaths);
  const includePath = useAppStore((state) => state.includePath);
  const { scan, isScanning, isError, progressPct, projectsFound, currentPath, rootProgress } = useScan();
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

  if (isScanning) {
    return (
      <div className="flex h-full justify-center overflow-y-auto">
        <div className="w-full max-w-[620px] px-10 pt-[72px] pb-16">
          <ScanningView
            rootCount={roots.length}
            projectsFound={projectsFound}
            progressPct={progressPct}
            currentPath={currentPath}
            rootProgress={rootProgress}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full justify-center overflow-y-auto">
      <div className="flex w-full max-w-[620px] flex-col gap-9 px-10 pt-[72px] pb-16">
        <div>
          <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.01em] text-ink">
            {hasScanned ? "Pastas da varredura" : "Bem-vindo ao Molt"}
          </h1>
          <p className="mt-2 text-[14.5px] leading-[23px] text-ink-2">
            O Molt varre as pastas que você escolher em busca de projetos de código, mede o espaço ocupado por
            artefatos regeneráveis (como <code className="font-mono text-[13px] text-ink">node_modules</code> e{" "}
            <code className="font-mono text-[13px] text-ink">target</code>) e mostra o que pode ser liberado.
          </p>
        </div>

        <div className="border-t border-line">
          <div className="flex gap-4 border-b border-line py-3.5">
            <span className="w-[88px] shrink-0 font-mono text-[11.5px] text-ink-3">Lixeira</span>
            <p className="text-[14px] leading-[22px] font-medium text-ink">
              Nada é apagado direto do disco: toda limpeza vai para a Lixeira do macOS e pode ser desfeita.
            </p>
          </div>
          <div className="flex gap-4 border-b border-line py-3.5">
            <span className="w-[88px] shrink-0 font-mono text-[11.5px] text-ink-3">Permissão</span>
            <p className="text-[13px] leading-5 text-ink-2">
              Para detectar caches de ferramentas como Xcode e simuladores, o macOS pode pedir Acesso Total ao Disco
              em Ajustes do Sistema → Privacidade e Segurança.
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">Pastas raiz da varredura</h2>
            <span className="font-mono text-[11px] text-ink-3">
              {roots.length} {roots.length === 1 ? "pasta" : "pastas"}
            </span>
          </div>

          <ul className="mt-2 border-t border-line">
            {roots.map((root) => (
              <li key={root} className="flex h-9 items-center justify-between gap-3 border-b border-line">
                <span className="truncate font-mono text-[12.5px] text-ink">{root}</span>
                <button
                  type="button"
                  onClick={() => removeRoot(root)}
                  className="flex h-6 shrink-0 items-center rounded-xs px-1.5 text-xs text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-risk"
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
          {roots.length === 0 && (
            <p className="mt-2 text-[13px] text-ink-3">Adicione pelo menos uma pasta para varrer.</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={customRoot}
              onChange={(event) => setCustomRoot(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleAddCustom()}
              placeholder="/Users/voce/outra-pasta"
              className="h-[30px] flex-[1_1_240px] rounded-sm border border-line-strong bg-surface px-2.5 font-mono text-[12.5px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="h-[30px] rounded-sm border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors duration-100 hover:border-ink-3 hover:text-ink"
            >
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => void handleBrowse()}
              className="flex h-[30px] items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors duration-100 hover:border-ink-3 hover:text-ink"
            >
              <FolderIcon className="size-3.5" />
              Procurar…
            </button>
          </div>

          {excludedPaths.length > 0 && (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowIgnored((value) => !value)}
                aria-expanded={showIgnored}
                className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
              >
                Pastas ignoradas ({excludedPaths.length})
                {showIgnored ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
              </button>
              {showIgnored && (
                <ul className="mt-2 border-t border-line">
                  {excludedPaths.map((path) => (
                    <li key={path} className="flex h-9 items-center justify-between gap-3 border-b border-line">
                      <span className="truncate font-mono text-[12.5px] text-ink">{path}</span>
                      <button
                        type="button"
                        onClick={() => includePath(path)}
                        className="flex h-6 shrink-0 items-center rounded-xs px-1.5 text-xs text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
                      >
                        parar de ignorar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={roots.length === 0}
            className="flex h-[34px] items-center gap-2 rounded-sm bg-shed px-[18px] text-[13.5px] font-semibold text-shed-ink transition-opacity duration-100 enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
          >
            <ScanIcon className="size-4" />
            Começar varredura
          </button>
        </div>
        {isError && <p className="text-[13px] text-risk">A varredura falhou. Tente novamente.</p>}
      </div>
    </div>
  );
}
