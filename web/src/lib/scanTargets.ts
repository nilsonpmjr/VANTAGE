const BATCH_PATTERN = /[,;\n]/;
export const BATCH_MAX_ITEMS = 100;

export type SearchDirective =
  | { kind: "cidr"; value: string }
  | { kind: "tag"; value: string }
  | null;

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

export function parseSearchDirective(value: string): SearchDirective {
  const cleaned = value.trim();
  if (/^cidr:/i.test(cleaned)) {
    return { kind: "cidr", value: cleaned.replace(/^cidr:/i, "").trim() };
  }
  if (/^tag:/i.test(cleaned)) {
    return { kind: "tag", value: cleaned.replace(/^tag:/i, "").trim() };
  }
  return null;
}

function ipToNumber(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function numberToIp(value: number) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

export function expandIpv4Cidr(cidr: string) {
  const match = cidr.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
  if (!match) return [];

  const baseIp = ipToNumber(match[1]);
  const prefix = Number(match[2]);
  if (baseIp == null || prefix < 0 || prefix > 32) return [];

  const hostBits = 32 - prefix;
  const total = 2 ** hostBits;
  const mask = prefix === 0 ? 0 : ((0xffffffff << hostBits) >>> 0);
  const network = baseIp & mask;
  const targets: string[] = [];

  for (let index = 0; index < total; index += 1) {
    targets.push(numberToIp((network + index) >>> 0));
  }

  return targets;
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
