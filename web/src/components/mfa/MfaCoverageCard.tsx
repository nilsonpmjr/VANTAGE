import { ShieldCheck } from "lucide-react";

type Density = "compact" | "detailed";

interface Props {
  totalUsers: number;
  usersWithMfa: number;
  label: string;
  helpText?: string;
  density?: Density;
}

function toneFor(percent: number) {
  if (percent >= 90) return { bar: "bg-primary", text: "text-primary" };
  if (percent >= 60) return { bar: "bg-warning", text: "text-warning" };
  return { bar: "bg-error", text: "text-error" };
}

export default function MfaCoverageCard({
  totalUsers,
  usersWithMfa,
  label,
  helpText,
  density = "detailed",
}: Props) {
  const percent =
    totalUsers > 0 ? Math.round((usersWithMfa / totalUsers) * 100) : 0;
  const tone = toneFor(percent);

  if (density === "compact") {
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-3.5 w-3.5 ${tone.text}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            {label}
          </span>
        </div>
        <span className={`text-sm font-black tabular-nums ${tone.text}`}>
          {percent}%
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-outline-variant/20 bg-surface-container-low p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-4 w-4 ${tone.text}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            {label}
          </span>
        </div>
        <span className={`text-lg font-black tabular-nums ${tone.text}`}>
          {percent}%
        </span>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-highest"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div
          className={`h-full ${tone.bar} transition-all`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-on-surface-variant">
        <span className="tabular-nums">
          {usersWithMfa} / {totalUsers}
        </span>
        {helpText ? <span className="truncate">{helpText}</span> : null}
      </div>
    </div>
  );
}
