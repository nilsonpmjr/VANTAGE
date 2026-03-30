import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, Fingerprint, Search, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../shared/SectionHeader';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import API_URL from '../../config';

const ARTIFACT_OPTIONS = ['username', 'alias', 'email', 'account'];

function artifactLabel(t, value) {
    return t(`hunting.artifact_${value}`);
}

function confidenceVariant(confidence) {
    if (typeof confidence !== 'number') return 'neutral';
    if (confidence >= 0.7) return 'success';
    if (confidence >= 0.5) return 'warning';
    return 'danger';
}

function formatConfidence(confidence) {
    if (typeof confidence !== 'number') return '—';
    return `${Math.round(confidence * 100)}%`;
}

export default function PremiumHuntingPage() {
    const { t } = useTranslation();
    const [artifactType, setArtifactType] = useState('username');
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState(null);
    const [response, setResponse] = useState(null);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!query.trim() || searching) return;

        setSearching(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/api/hunting/search`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artifact_type: artifactType,
                    query: query.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'hunting.search_failed');
            }
            setResponse(data);
        } catch (err) {
            setResponse(null);
            setError(err.message || 'hunting.search_failed');
        } finally {
            setSearching(false);
        }
    };

    const allResults = response
        ? response.items.flatMap((item) =>
            item.status === 'ok'
                ? item.results.map((result) => ({ ...result, _provider: item.provider }))
                : []
        )
        : [];

    const unsupportedProviders = response
        ? response.items.filter((item) => item.status !== 'ok')
        : [];

    return (
        <div className="v-arch-workbench fade-in">
            <SectionHeader
                title={t('hunting.page_title')}
                subtitle={t('hunting.page_description')}
                icon={<Fingerprint size={22} color="var(--primary)" />}
            />

            <section className="glass-panel hunting-form-panel">
                <form onSubmit={handleSubmit} className="hunting-form">
                    <div className="form-grid">
                        <label className="form-field">
                            <span className="form-field__label">{t('hunting.field_artifact')}</span>
                            <select
                                className="form-input"
                                value={artifactType}
                                onChange={(e) => setArtifactType(e.target.value)}
                            >
                                {ARTIFACT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {artifactLabel(t, option)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="form-field">
                            <span className="form-field__label">{t('hunting.field_query')}</span>
                            <input
                                type="text"
                                className="form-input"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t('hunting.query_placeholder')}
                            />
                        </label>
                    </div>

                    <div className="hunting-form__actions">
                        <Button
                            type="submit"
                            variant="primary"
                            size="md"
                            disabled={!query.trim()}
                            loading={searching}
                            iconLeading={<Search size={16} />}
                        >
                            {searching ? t('hunting.searching') : t('hunting.search_cta')}
                        </Button>
                        <span className="hunting-form__tip">{t('hunting.supported_tip')}</span>
                    </div>
                </form>

                {error && (
                    <div className="alert-banner error">
                        <AlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                )}
            </section>

            <section>
                <div className="hunting-results__header">
                    <div>
                        <h3 className="hunting-results__title">{t('hunting.results_title')}</h3>
                        <p className="hunting-results__subtitle">
                            {response
                                ? t('hunting.results_subtitle_active', {
                                    artifact: artifactLabel(t, response.query?.artifact_type || artifactType),
                                    query: response.query?.query || query,
                                    count: response.total_results || 0,
                                })
                                : t('hunting.results_subtitle_idle')}
                        </p>
                    </div>
                    {response && (
                        <Badge variant="primary">
                            {t('hunting.providers_consulted', { count: response.items?.length || 0 })}
                        </Badge>
                    )}
                </div>

                {unsupportedProviders.length > 0 && unsupportedProviders.map((item) => (
                    <div key={item.provider.key} className="alert-banner warning">
                        <AlertTriangle size={14} />
                        <span><strong>{item.provider.name}</strong> — {item.error}</span>
                    </div>
                ))}

                {!response && !searching && (
                    <div className="v-empty-state">
                        <Fingerprint size={32} className="v-empty-state__icon" />
                        <p className="v-empty-state__text">{t('hunting.results_empty_state')}</p>
                    </div>
                )}

                {searching && (
                    <div className="v-empty-state">
                        <span className="loader-pulse hunting-loader" />
                        <p className="v-empty-state__text">{t('hunting.searching')}</p>
                    </div>
                )}

                {response && allResults.length === 0 && unsupportedProviders.length < response.items.length && (
                    <div className="v-empty-state">
                        <ShieldCheck size={28} className="v-empty-state__icon" />
                        <p className="v-empty-state__text">{t('hunting.no_matches')}</p>
                    </div>
                )}

                {allResults.length > 0 && (
                    <div className="v-zone-grid">
                        {allResults.map((result) => (
                            <article
                                key={`${result.provider_key}-${result.external_ref || result.data?.title}`}
                                className="glass-panel hunting-result-card"
                            >
                                <div
                                    className="hunting-result-card__accent"
                                    data-confidence={confidenceVariant(result.data?.confidence)}
                                />
                                <div className="hunting-result-card__body">
                                    <div className="hunting-result-card__header">
                                        <strong className="hunting-result-card__title">
                                            {result.data?.attributes?.platform || result.data?.title}
                                        </strong>
                                        <Badge variant={confidenceVariant(result.data?.confidence)}>
                                            {formatConfidence(result.data?.confidence)}
                                        </Badge>
                                    </div>

                                    <p className="hunting-result-card__summary">{result.data?.summary}</p>

                                    <div className="hunting-result-card__tags">
                                        <Badge variant="neutral">{result._provider?.name || result.provider_key}</Badge>
                                        {result.data?.attributes?.claimed && (
                                            <Badge variant="success">{t('hunting.claimed')}</Badge>
                                        )}
                                    </div>

                                    {result.external_ref && (
                                        <a
                                            href={result.external_ref}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="hunting-result-card__link"
                                        >
                                            <ExternalLink size={14} />
                                            {t('hunting.open_profile')}
                                        </a>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
