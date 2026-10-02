import { type ComponentType, useRef, useState } from "react";
import type { SpellingState } from "../../types/global";
import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { ChevronDownIcon } from "../Icons";
import Menu, { type MenuAnchor } from "../Menu";
import { SettingRow, SmallButton, Switch } from "./SettingsPrimitives";

const names = new Intl.DisplayNames(["en-GB"], {
  type: "language",
  style: "short",
  languageDisplay: "standard",
});
/** A dictionary's name as a person says it: `en-GB` is English (UK). */
export const languageName = (code: string) => {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
};

/**
 * Settings → Spelling: the switch, then the languages. Elsewhere the app
 * checks any number of languages together, chosen from a menu of ticks; on a
 * Mac the system chooses (Keyboard → Text Input), so the row says so and
 * opens that page rather than offering a control that would do nothing.
 * Every change applies at once.
 */
export default function SpellingSection({
  SectionHeader,
}: {
  SectionHeader: ComponentType<{ title: string }>;
}) {
  const { theme } = useTheme();
  const { spelling: state, changeSpelling: change } = useSettings() as {
    spelling: SpellingState | null;
    changeSpelling: (next: { enabled?: boolean; languages?: string[] }) => Promise<void>;
  };
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (!state) return null;

  const chosen = state.languages;
  // The ticked first, then the rest by name.
  const byName = (a: string, b: string) => languageName(a).localeCompare(languageName(b));
  const rows = [
    ...[...chosen].sort(byName),
    ...state.available.filter((l) => !chosen.includes(l)).sort(byName),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionHeader title="Spelling" />
      <SettingRow label="Check spelling">
        <Switch
          checked={state.enabled}
          label="Check spelling"
          onChange={(enabled: boolean) => change({ enabled })}
        />
      </SettingRow>
      <SettingRow label="Languages">
        {state.setBySystem ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: theme.TEXT.secondary }}>Set by your Mac</span>
            <SmallButton onClick={() => window.electronAPI?.openKeyboardSettings()}>
              Open Keyboard Settings
            </SmallButton>
          </div>
        ) : (
          <SmallButton
            ref={buttonRef}
            aria-haspopup="menu"
            aria-expanded={!!menu}
            onClick={() => {
              const r = buttonRef.current?.getBoundingClientRect();
              if (r) setMenu({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: 260 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {chosen.map(languageName).join(", ")}
              </span>
              <ChevronDownIcon size={12} />
            </span>
          </SmallButton>
        )}
      </SettingRow>
      {menu && (
        <Menu
          label="Spelling languages"
          idPrefix="spelling-language"
          anchor={menu}
          gapY={4}
          align="end"
          maxHeight={320}
          minWidth={220}
          onClose={() => setMenu(null)}
          items={rows.map((code) => {
            const on = chosen.includes(code);
            return {
              label: languageName(code),
              role: "menuitemcheckbox" as const,
              checked: on,
              // One language is always checked; Check spelling is the off switch.
              disabled: on && chosen.length === 1,
              action: () =>
                change({
                  languages: on ? chosen.filter((l) => l !== code) : [...chosen, code],
                }),
            };
          })}
        />
      )}
    </div>
  );
}
