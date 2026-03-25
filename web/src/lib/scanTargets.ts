const BATCH_PATTERN = /[,;\n]/;
export const BATCH_MAX_ITEMS = 100;

export function parseTargets(value: string) {
  return value
    .split(/[,;\n\s]+/)
    .map((target) => target.trim())
    .filter(Boolean);
}

export function looksLikeTarget(value: string) {
  if (!value || value.length < 3) return false;
  return /^[\w.:/@-]+$/.test(value);
}

export function isBatchInput(value: string) {
  return BATCH_PATTERN.test(value) && parseTargets(value).length > 1;
}

export function parseFileTargets(file: File) {
  return new Promise<string[]>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || "");
        let lines: string[] = [];

        if (file.name.endsWith(".csv")) {
          const rows = text.split(/\r?\n/).filter(Boolean);
          const firstCell = rows[0]?.split(",")[0]?.trim();
          const startIndex = looksLikeTarget(firstCell) ? 0 : 1;
          lines = rows
            .slice(startIndex)
            .map((row) => row.split(",")[0]?.trim() || "");
        } else {
          lines = text.split(/\r?\n/).map((line) => line.trim());
        }

        const targets = lines.filter(Boolean).filter(looksLikeTarget);
        resolve(targets);
      } catch {
        reject(new Error("parse_error"));
      }
    };

    reader.onerror = () => reject(new Error("read_error"));
    reader.readAsText(file);
  });
}
