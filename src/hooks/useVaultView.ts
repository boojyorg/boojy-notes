import { useCallback, useState } from "react";
import { DEFAULT_VAULT_VIEW, type VaultView } from "../utils/otherFiles";

/**
 * What the sidebar's tree shows besides notes, remembered per vault
 * (localStorage, keyed by the vault's path, as recent notes are): a Drive
 * folder full of PDFs can hide them while another vault shows them. A
 * preference of this window, never written into the vault.
 */
const KEY = "boojy-vault-view";

function readAll(): Record<string, Partial<VaultView>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readVaultView(vaultKey: string): VaultView {
  const saved = readAll()[vaultKey];
  return {
    otherFiles:
      typeof saved?.otherFiles === "boolean" ? saved.otherFiles : DEFAULT_VAULT_VIEW.otherFiles,
    attachments:
      typeof saved?.attachments === "boolean" ? saved.attachments : DEFAULT_VAULT_VIEW.attachments,
  };
}

export function useVaultView(vaultKey: string): [VaultView, (next: VaultView) => void] {
  // Keyed state: a vault switch reads the new vault's view on the next render.
  const [state, setState] = useState(() => ({ key: vaultKey, view: readVaultView(vaultKey) }));
  const current = state.key === vaultKey ? state.view : readVaultView(vaultKey);
  if (state.key !== vaultKey) setState({ key: vaultKey, view: current });
  const setView = useCallback(
    (next: VaultView) => {
      setState({ key: vaultKey, view: next });
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [vaultKey]: next }));
      } catch {
        /* storage full or blocked: the choice lasts this session */
      }
    },
    [vaultKey],
  );
  return [current, setView];
}
