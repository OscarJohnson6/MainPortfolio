// logic/saveSystem.ts — run persistence (localStorage + file export/import)

export const ACTIVE_RUN_KEY = 'house-rules-active-run';
export const SAVE_VERSION = 1;

export type ActiveRunSave = {
  version: number;
  savedAt: string;
  summary: string;
  state: Record<string, any>;
};

export function readActiveRunSave(): ActiveRunSave | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(ACTIVE_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SAVE_VERSION || !parsed.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeActiveRunSave(save: ActiveRunSave): void {
  try {
    localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(save));
  } catch {
    console.warn('House Rules: could not write save to localStorage');
  }
}

export function clearActiveRunSave(): void {
  try {
    localStorage.removeItem(ACTIVE_RUN_KEY);
  } catch {}
}

export function buildResumeSummary(save: ActiveRunSave | null): string | null {
  if (!save) return null;
  const s = save.state ?? {};
  const mode = s.gameMode === 'alphabet' ? 'Alphabet' : 'Card';
  const place = `Act ${(s.actIdx ?? 0) + 1}${s.isBoss ? ' Boss' : ` Table ${(s.tableIdx ?? 0) + 1}`}`;
  const cash = typeof s.money === 'number' ? `$${s.money}` : '$0';
  return `${mode} · ${place} · ${cash}`;
}

export function makeSaveFileName(save: ActiveRunSave): string {
  const stamp = (save.savedAt ?? new Date().toISOString())
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  return `house-rules-save-${stamp}.json`;
}

/** Download the current save as a JSON file. */
export function exportSaveToFile(save: ActiveRunSave): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = makeSaveFileName(save);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read an imported JSON file and persist it to localStorage. Calls onSuccess or onError. */
export function importSaveFromFile(
  file: File,
  onSuccess: (save: ActiveRunSave) => void,
  onError: (msg: string) => void,
): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result ?? ''));
      if (!parsed || parsed.version !== SAVE_VERSION || !parsed.state) throw new Error('invalid');
      writeActiveRunSave(parsed);
      onSuccess(parsed);
    } catch {
      onError('Invalid House Rules save file.');
    }
  };
  reader.readAsText(file);
}
