const TZ = 'America/Sao_Paulo';

export function fmtBRT(raw, locale = 'pt-BR') {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleString(locale, { timeZone: TZ });
}

export function fmtDateBRT(raw, locale = 'pt-BR') {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString(locale, { timeZone: TZ });
}

export function fmtTimeBRT(raw, locale = 'pt-BR') {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleTimeString(locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
