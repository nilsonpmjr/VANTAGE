import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Blocks, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Panel from '../ui/Panel';

function statusVariant(status) {
    return {
        enabled: 'success',
        detected: 'neutral',
        disabled: 'neutral',
        incompatible: 'warning',
        invalid: 'danger',
    }[status] || 'neutral';
}

function humanizeList(values) {
    if (!values || values.length === 0) return '—';
    return values.join(', ');
}

function compactValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return humanizeList(value);
    if (typeof value === 'boolean') return String(value);
    return String(value);
}

function formatCount(value) {
    return typeof value === 'number' ? String(value) : '0';
}

export default function ExtensionsCatalogPanel() {
    const { t } = useTranslation();
    const [catalog, setCatalog] = useState({ items: [], core_version: '' });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const loadCatalog = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_URL}/api/admin/extensions${isRefresh ? '?refresh=true' : ''}`, {
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.extensions_catalog_load_error'));
            }
            setCatalog({
                items: data.items || [],
                core_version: data.core_version || '',
            });
        } catch (err) {
            setError(err.message);
        } finally {
            if (isRefresh) setRefreshing(false);
            else setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    const summary = useMemo(() => {
        const items = catalog.items || [];
        return {
            total: items.length,
            enabled: items.filter((item) => item.status === 'enabled').length,
            incompatible: items.filter((item) => item.status === 'incompatible').length,
            invalid: items.filter((item) => item.status === 'invalid').length,
        };
    }, [catalog.items]);

    return (
        <div className="v-page-stack fade-in">
            <SectionHeader
                icon={<Blocks size={22} color="var(--primary)" />}
                title={t('settings.extensions_catalog_title')}
                subtitle={t('settings.extensions_catalog_subtitle')}
                actions={(
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => loadCatalog(true)}
                        loading={refreshing}
                        iconLeading={<RefreshCw size={14} />}
                    >
                        {t('settings.extensions_catalog_refresh')}
                    </Button>
                )}
            />

            {loading ? (
                <div className="control-plane-loading">
                    <RefreshCw className="spin" size={24} color="var(--primary)" />
                </div>
            ) : (
                <>
                    {error ? <div className="control-plane-alert error">{error}</div> : null}

                    <div className="control-plane-kpi-grid">
                        <Panel title={t('settings.extensions_catalog_summary_total')} eyebrow={t('settings.extensions_catalog_summary')}>
                            <div className="control-plane-kpi">{summary.total}</div>
                        </Panel>
                        <Panel title={t('settings.extensions_catalog_summary_enabled')} eyebrow={t('settings.extensions_catalog_summary')}>
                            <div className="control-plane-kpi success">{summary.enabled}</div>
                        </Panel>
                        <Panel title={t('settings.extensions_catalog_summary_incompatible')} eyebrow={t('settings.extensions_catalog_summary')}>
                            <div className="control-plane-kpi warning">{summary.incompatible}</div>
                        </Panel>
                        <Panel title={t('settings.extensions_catalog_summary_invalid')} eyebrow={t('settings.extensions_catalog_summary')}>
                            <div className="control-plane-kpi danger">{summary.invalid}</div>
                        </Panel>
                    </div>

                    <Panel
                        title={t('settings.extensions_catalog_snapshot_title')}
                        description={t('settings.extensions_catalog_snapshot_body')}
                    >
                        <div className="control-plane-note">
                            <Badge variant="neutral">{t('settings.extensions_catalog_core_version')}</Badge>
                            <span>{catalog.core_version || '—'}</span>
                        </div>
                    </Panel>

                    {(catalog.items || []).length === 0 ? (
                        <Panel
                            title={t('settings.extensions_catalog_empty_title')}
                            description={t('settings.extensions_catalog_empty_body')}
                        />
                    ) : (
                    <div className="service-status-grid">
                        {(catalog.items || []).map((item) => (
                            <Panel
                                key={item.key}
                                title={item.name}
                                eyebrow={item.kind}
                                actions={(
                                    <Badge variant={statusVariant(item.status)}>
                                        {t(`settings.extensions_catalog_status_${item.status}`)}
                                    </Badge>
                                )}
                            >
                                <div className="service-status-card">
                                    {item.errors?.length ? (
                                        <div className="control-plane-alert warning">{item.errors.join(', ')}</div>
                                    ) : null}

                                    <div className="service-status-columns">
                                        <div>
                                            <h4>{t('settings.extensions_catalog_metadata')}</h4>
                                            <ul className="service-status-list">
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_key')}</span>
                                                    <strong>{item.key}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_version')}</span>
                                                    <strong>{compactValue(item.version)}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_author')}</span>
                                                    <strong>{compactValue(item.author)}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_license')}</span>
                                                    <strong>{compactValue(item.license)}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_compatible_core')}</span>
                                                    <strong>{compactValue(item.compatibleCore)}</strong>
                                                </li>
                                            </ul>
                                        </div>

                                        <div>
                                            <h4>{t('settings.extensions_catalog_runtime')}</h4>
                                            <ul className="service-status-list">
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_capabilities')}</span>
                                                    <strong>{compactValue(item.capabilities)}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_permissions')}</span>
                                                    <strong>{compactValue(item.permissions)}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_entrypoint')}</span>
                                                    <strong>{compactValue(item.entrypoint)}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_source')}</span>
                                                    <strong>{compactValue(item.source)}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.extensions_catalog_field_builtin')}</span>
                                                    <strong>{compactValue(item.builtin)}</strong>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>

                                    {item.kind === 'brand_pack' ? (
                                        <div className="service-status-columns">
                                            <div>
                                                <h4>{t('settings.extensions_catalog_brand')}</h4>
                                                <ul className="service-status-list">
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_themes')}</span>
                                                        <strong>{compactValue(item.themes)}</strong>
                                                    </li>
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_source_files')}</span>
                                                        <strong>{formatCount(item.sourceFileCount)}</strong>
                                                    </li>
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_public_assets')}</span>
                                                        <strong>{formatCount(item.publicAssetCount)}</strong>
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    ) : null}

                                    {item.kind === 'recon_module' ? (
                                        <div className="service-status-columns">
                                            <div>
                                                <h4>{t('settings.extensions_catalog_recon')}</h4>
                                                <ul className="service-status-list">
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_module_count')}</span>
                                                        <strong>{formatCount(item.moduleCount)}</strong>
                                                    </li>
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_available_modules')}</span>
                                                        <strong>{formatCount(item.availableModuleCount)}</strong>
                                                    </li>
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_target_types')}</span>
                                                        <strong>{compactValue(item.supportedTargetTypes)}</strong>
                                                    </li>
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_required_binaries')}</span>
                                                        <strong>{compactValue(item.requiredBinaries)}</strong>
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    ) : null}

                                    {item.kind === 'report_exporter' ? (
                                        <div className="service-status-columns">
                                            <div>
                                                <h4>{t('settings.extensions_catalog_exporter')}</h4>
                                                <ul className="service-status-list">
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_formats')}</span>
                                                        <strong>{compactValue(item.formats)}</strong>
                                                    </li>
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_delivery')}</span>
                                                        <strong>{compactValue(item.delivery)}</strong>
                                                    </li>
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_export_function')}</span>
                                                        <strong>{compactValue(item.exportFunction)}</strong>
                                                    </li>
                                                    <li>
                                                        <span>{t('settings.extensions_catalog_field_source_files')}</span>
                                                        <strong>{formatCount(item.sourceFileCount)}</strong>
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </Panel>
                        ))}
                    </div>
                    )}
                </>
            )}
        </div>
    );
}
