import ModalShell from "../modal/ModalShell";
import { useLanguage } from "../../context/LanguageContext";
import { buildShortcutGroups, type ShortcutGroup } from "../../lib/shortcuts";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? "\u2318" : "Ctrl";

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 bg-surface-container-highest text-on-surface text-[10px] font-mono font-bold rounded-sm border border-outline-variant/30">
      {children}
    </kbd>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ open, onClose }: Props) {
  const { t } = useLanguage();
  const groups: ShortcutGroup[] = buildShortcutGroups(t, mod, true);

  if (!open) return null;

  return (
    <ModalShell
      title={t("help.shortcuts")}
      description={t("help.shortcutsFooterPost")}
      icon={t("help.shortcuts")}
      onClose={onClose}
      ariaLabel={t("help.shortcutCloseModal")}
      variant="dialog"
      bodyClassName="space-y-6 max-h-[70vh]"
      footer={
        <p className="text-[10px] text-on-surface-variant">
          {t("help.press")} <Kbd>Esc</Kbd> {t("help.shortcutsFooterPost")}
        </p>
      }
    >
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-on-surface">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, kIdx) => (
                        <span key={kIdx} className="flex items-center gap-1">
                          {kIdx > 0 && (
                            <span className="text-[9px] text-outline font-bold">
                              {shortcut.keys[0].length === 1 &&
                              shortcut.keys[1].length === 1
                                ? t("help.then")
                                : "+"}
                            </span>
                          )}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
    </ModalShell>
  );
}
