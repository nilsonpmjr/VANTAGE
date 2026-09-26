import { useState, type FormEvent } from "react";
import { BadgeCheck, Globe2, Network, Plus, Trash2 } from "lucide-react";
import type {
  ClientIdentityKind,
  ProjectIdentity,
} from "./api";

const kindLabels: Record<ClientIdentityKind, string> = {
  domain: "Domínio principal",
  asn: "ASN conhecido",
};

function kindIcon(kind: ClientIdentityKind) {
  return kind === "domain" ? Globe2 : Network;
}

export function IdentitySummary({
  identity,
  loading = false,
  error = "",
  compact = false,
}: {
  identity: ProjectIdentity | null;
  loading?: boolean;
  error?: string;
  compact?: boolean;
}) {
  if (loading && !identity) {
    return <p className="text-xs text-on-surface-variant">Carregando identidade técnica...</p>;
  }
  if (error && !identity) {
    return <p className="text-xs text-error" role="alert">{error}</p>;
  }

  const confirmed = identity?.confirmed || [];
  const suggested = (identity?.suggestions || []).filter((item) => !item.confirmed);
  const visibleConfirmed = compact ? confirmed.slice(0, 4) : confirmed;
  const visibleSuggested = compact ? suggested.slice(0, 4) : suggested;

  return (
    <div className={compact
      ? "rounded-sm border border-outline-variant/20 bg-surface-container-low/50 p-4"
      : "space-y-4"}
    >
      {compact && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface">Identidade técnica do cliente</p>
            <p className="mt-1 text-xs text-on-surface-variant">Confirmações organizam o contexto; não ampliam o escopo efetivo.</p>
          </div>
          <span className="badge badge-neutral">revisão {identity?.revision || 0}</span>
        </div>
      )}
      {!confirmed.length && !suggested.length ? (
        <p className="text-sm text-on-surface-variant">
          {identity?.active_scope_version
            ? "A versão ativa ainda não produziu candidatos de domínio ou ASN."
            : "Publique um escopo para gerar sugestões de identidade."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visibleConfirmed.map((item) => {
            const Icon = kindIcon(item.kind);
            return (
              <span key={`confirmed-${item.kind}-${item.value}`} className="inline-flex items-center gap-1.5 rounded-sm border border-success/30 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-on-surface">
                <Icon className="h-3.5 w-3.5 text-success" />
                <span className="font-mono">{item.value}</span>
                <span className="text-success">Confirmado</span>
              </span>
            );
          })}
          {visibleSuggested.map((item) => {
            const Icon = kindIcon(item.kind);
            return (
              <span key={`suggested-${item.kind}-${item.value}`} className="inline-flex items-center gap-1.5 rounded-sm border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs font-semibold text-on-surface">
                <Icon className="h-3.5 w-3.5 text-warning" />
                <span className="font-mono">{item.value}</span>
                <span className="text-warning">Sugerido</span>
              </span>
            );
          })}
          {compact && confirmed.length + suggested.length > visibleConfirmed.length + visibleSuggested.length && (
            <span className="badge badge-neutral">
              +{confirmed.length + suggested.length - visibleConfirmed.length - visibleSuggested.length}
            </span>
          )}
        </div>
      )}
      {error && identity && <p className="text-xs text-error" role="alert">{error}</p>}
    </div>
  );
}

export default function IdentityPanel({
  identity,
  loading,
  error,
  canManage,
  saving,
  onConfirm,
  onRemove,
}: {
  identity: ProjectIdentity | null;
  loading: boolean;
  error: string;
  canManage: boolean;
  saving: boolean;
  onConfirm: (kind: ClientIdentityKind, value: string) => void;
  onRemove: (kind: ClientIdentityKind, value: string) => void;
}) {
  const [kind, setKind] = useState<ClientIdentityKind>("domain");
  const [value, setValue] = useState("");
  const confirmedKeys = new Set((identity?.confirmed || []).map((item) => `${item.kind}:${item.value}`));
  const suggestions = (identity?.suggestions || []).filter(
    (item) => !confirmedKeys.has(`${item.kind}:${item.value}`),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;
    onConfirm(kind, value.trim());
    setValue("");
  }

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div>
          <h2 className="card-title">Identidade técnica do cliente</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Domínios e ASNs confirmados pelo responsável. Uma confirmação organiza o workspace, mas não cria regra nem autoriza ativos relacionados.
          </p>
        </div>
        <BadgeCheck className="h-5 w-5 text-primary" />
      </div>
      <div className="card-body space-y-6">
        {loading && !identity ? (
          <p className="text-sm text-on-surface-variant">Carregando identidade técnica...</p>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">Confirmações</h3>
                <span className="badge badge-neutral">revisão {identity?.revision || 0}</span>
              </div>
              {!identity?.confirmed.length ? (
                <p className="mt-3 text-sm text-on-surface-variant">Nenhum domínio ou ASN foi confirmado.</p>
              ) : (
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {identity.confirmed.map((item) => {
                    const Icon = kindIcon(item.kind);
                    return (
                      <li key={`${item.kind}-${item.value}`} className="rounded-sm border border-success/30 bg-success/5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-success">
                              <Icon className="h-3.5 w-3.5" /> {kindLabels[item.kind]} · confirmado
                            </p>
                            <p className="mt-2 break-all font-mono text-sm font-semibold text-on-surface">{item.value}</p>
                            <p className="mt-2 text-xs text-on-surface-variant">
                              por {item.confirmed_by} · {new Date(item.confirmed_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          {canManage && (
                            <button
                              type="button"
                              className="rounded-sm p-2 text-on-surface-variant hover:bg-error/10 hover:text-error"
                              aria-label={`Remover confirmação ${item.value}`}
                              disabled={saving}
                              onClick={() => onRemove(item.kind, item.value)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-outline-variant/20 pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface">Sugestões da versão ativa</h3>
              <p className="mt-1 text-xs text-on-surface-variant">Candidatos continuam apenas sugeridos até uma ação explícita do responsável.</p>
              {!suggestions.length ? (
                <p className="mt-3 text-sm text-on-surface-variant">
                  {identity?.active_scope_version ? "Nenhuma sugestão pendente." : "Nenhum escopo ativo para analisar."}
                </p>
              ) : (
                <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {suggestions.map((item) => {
                    const Icon = kindIcon(item.kind);
                    const sources = new Set(item.origins.flatMap((origin) => origin.source_ids));
                    const enriched = item.origins.some((origin) => origin.method === "enrichment");
                    const providers = new Set(
                      item.origins.map((origin) => origin.provider).filter(Boolean),
                    );
                    return (
                      <li key={`${item.kind}-${item.value}`} className="rounded-sm border border-warning/30 bg-warning/5 p-4">
                        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-warning">
                          <Icon className="h-3.5 w-3.5" /> {kindLabels[item.kind]} · sugerido
                        </p>
                        <p className="mt-2 break-all font-mono text-sm font-semibold text-on-surface">{item.value}</p>
                        <p className="mt-2 text-xs text-on-surface-variant">
                          {sources.size} fonte{sources.size === 1 ? "" : "s"} · {item.origins.length} origem{item.origins.length === 1 ? "" : "s"}
                          {enriched ? " · inclui enriquecimento com proveniência" : ""}
                        </p>
                        {sources.size > 0 && (
                          <p className="mt-1 break-all font-mono text-[11px] text-on-surface-variant">
                            fontes: {Array.from(sources).slice(0, 3).join(", ")}{sources.size > 3 ? "…" : ""}
                          </p>
                        )}
                        {providers.size > 0 && (
                          <p className="mt-1 text-[11px] text-on-surface-variant">
                            provedor: {Array.from(providers).join(", ")}
                          </p>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            className="btn btn-outline mt-3 w-full"
                            disabled={saving}
                            onClick={() => onConfirm(item.kind, item.value)}
                          >
                            Confirmar
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {canManage && (
              <form onSubmit={submit} className="grid gap-3 border-t border-outline-variant/20 pt-5 md:grid-cols-[12rem_1fr_auto] md:items-end">
                <label className="text-sm font-medium text-on-surface">
                  Tipo
                  <select
                    value={kind}
                    onChange={(event) => setKind(event.target.value as ClientIdentityKind)}
                    className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2.5 text-on-surface"
                  >
                    <option value="domain">Domínio</option>
                    <option value="asn">ASN</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-on-surface">
                  Confirmação manual
                  <input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={kind === "domain" ? "cliente.com.br" : "AS64512"}
                    className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2.5 font-mono text-on-surface"
                    required
                  />
                </label>
                <button type="submit" className="btn btn-primary" disabled={saving || !value.trim()}>
                  <Plus className="h-4 w-4" /> {saving ? "Salvando..." : "Confirmar"}
                </button>
              </form>
            )}
          </>
        )}
        {error && <p className="text-sm text-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
