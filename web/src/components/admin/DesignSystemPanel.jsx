import React from 'react';
import { CheckCircle2, Layers3, Palette, ShieldAlert, AlertTriangle, Activity, Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../shared/SectionHeader';
import FormField from '../shared/FormField';
import Pagination from '../shared/Pagination';
import StatCard from '../shared/StatCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Panel from '../ui/Panel';
import Input from '../ui/Input';

const TOKEN_SPECS = [
    { key: 'canvas', labelKey: 'settings.design_system_token_canvas', cssVar: '--bg-base', preview: 'var(--bg-base)' },
    { key: 'shell', labelKey: 'settings.design_system_token_shell', cssVar: '--bg-main', preview: 'var(--bg-main)' },
    { key: 'panel', labelKey: 'settings.design_system_token_panel', cssVar: '--glass-bg', preview: 'var(--glass-bg)' },
    { key: 'border', labelKey: 'settings.design_system_token_border', cssVar: '--glass-border', preview: 'var(--glass-border)' },
    { key: 'primary', labelKey: 'settings.design_system_token_primary', cssVar: '--primary', preview: 'var(--primary)' },
    { key: 'text', labelKey: 'settings.design_system_token_text', cssVar: '--text-primary', preview: 'var(--text-primary)' },
    { key: 'text-muted', labelKey: 'settings.design_system_token_text_muted', cssVar: '--text-muted', preview: 'var(--text-muted)' },
    { key: 'safe', labelKey: 'settings.design_system_token_safe', cssVar: '--status-safe', preview: 'var(--status-safe)' },
    { key: 'risk', labelKey: 'settings.design_system_token_risk', cssVar: '--status-risk', preview: 'var(--status-risk)' },
];

function TokenCard({ label, cssVar, preview }) {
    return (
        <div className="v-token-card">
            <div className="v-token-swatch" style={{ background: preview }} />
            <span className="v-token-label">{label}</span>
            <span className="v-token-code">{cssVar}</span>
        </div>
    );
}

export default function DesignSystemPanel() {
    const { t } = useTranslation();

    return (
        <div className="v-page-stack fade-in">
            <SectionHeader
                icon={<Palette size={22} color="var(--primary)" />}
                title={t('settings.design_system_title')}
                subtitle={t('settings.design_system_subtitle')}
            />

            {/* Elementos Canônicos (A Verdade de Produção) */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                    <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Padrão Ouro: <code style={{ color: 'var(--primary)', background: 'var(--bg-card)', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>.glass-panel</code></h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Estrutura canônica do VANTAGE (painel de vidro), que deve ser utilizada para manter o arranjo idêntico à página principal de usuários.
                    </p>
                </div>
                
                {/* Exemplo de Toolbar e Tabela Canônica */}
                <div className="data-table-toolbar" style={{ margin: 0 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Exemplo de Toolbar
                    </span>
                    <div style={{ flex: 1, position: 'relative', maxWidth: '280px' }}>
                        <input
                            type="text"
                            placeholder={t('settings.search')}
                            className="data-table-search"
                            disabled
                        />
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>COLUNA A</th>
                                <th>COLUNA B</th>
                                <th>STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ fontWeight: 500 }}>Nome do Item Principal</td>
                                <td style={{ color: 'var(--text-secondary)' }}>Descritivo curto do Item</td>
                                <td><Badge variant="success">SAFE</Badge></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <Panel
                title={t('settings.design_system_intro_title')}
                description={t('settings.design_system_intro_body')}
            >
                <div className="v-inline-row">
                    <Badge variant="primary">{t('settings.design_system_badge_dark')}</Badge>
                    <Badge variant="neutral">{t('settings.design_system_badge_soc')}</Badge>
                    <Badge variant="success">{t('settings.design_system_badge_ready')}</Badge>
                </div>
            </Panel>

            <div className="v-showcase-grid">
                <Panel
                    title={t('settings.design_system_tokens_title')}
                    description={t('settings.design_system_tokens_body')}
                >
                    <div className="v-token-grid">
                        {TOKEN_SPECS.map((token) => (
                            <TokenCard
                                key={token.key}
                                label={t(token.labelKey)}
                                cssVar={token.cssVar}
                                preview={token.preview}
                            />
                        ))}
                    </div>
                </Panel>

                <Panel
                    title={t('settings.design_system_primitives_title')}
                    description={t('settings.design_system_primitives_body')}
                >
                    <div className="v-page-stack">
                        <div className="v-inline-row">
                            <Button>{t('settings.save')}</Button>
                            <Button variant="secondary">{t('settings.cancel')}</Button>
                            <Button variant="ghost">{t('settings.edit')}</Button>
                            <Button variant="danger">{t('settings.delete')}</Button>
                        </div>

                        <div className="v-inline-row">
                            <Badge variant="success">{t('verdict.safe')}</Badge>
                            <Badge variant="warning">{t('verdict.susp')}</Badge>
                            <Badge variant="danger">{t('verdict.risk')}</Badge>
                            <Badge variant="neutral">{t('settings.active')}</Badge>
                        </div>

                        <FormField
                            label={t('settings.design_system_input_label')}
                            hint={t('settings.design_system_input_hint')}
                            id="design-system-sample-input"
                            fullWidth
                        >
                            <Input
                                id="design-system-sample-input"
                                placeholder={t('settings.design_system_input_placeholder')}
                            />
                        </FormField>

                        <Panel
                            title={t('settings.design_system_panel_title')}
                            description={t('settings.design_system_panel_body')}
                        >
                            <div className="v-inline-row">
                                <Button size="sm" variant="secondary">{t('settings.export_title')}</Button>
                                <Button size="sm">{t('settings.import_btn')}</Button>
                            </div>
                        </Panel>
                    </div>
                </Panel>
            </div>

            {/* ── Padrões de Produto (D2–D4) ── */}
            <Panel
                title={t('settings.design_system_patterns_title')}
                description={t('settings.design_system_patterns_body')}
            >
                <div className="v-page-stack" style={{ gap: '2rem' }}>

                    {/* Pagination */}
                    <div className="v-section">
                        <h4 className="v-section__title">{t('settings.design_system_pagination_label')}</h4>
                        <div className="v-section__content">
                            <Pagination page={3} totalPages={8} onPageChange={() => {}} />
                        </div>
                    </div>

                    {/* Alert Banners */}
                    <div className="v-section">
                        <h4 className="v-section__title">{t('settings.design_system_alerts_label')}</h4>
                        <div className="v-section__content" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="alert-banner error">
                                <ShieldAlert size={16} />
                                <span>Error banner — ação crítica necessária.</span>
                                <button className="alert-banner-action">Action</button>
                            </div>
                            <div className="alert-banner warning">
                                <AlertTriangle size={16} />
                                <span>Warning banner — atenção recomendada.</span>
                            </div>
                            <div className="alert-banner success">
                                <CheckCircle2 size={16} />
                                <span>Success banner — operação concluída.</span>
                            </div>
                        </div>
                    </div>

                    {/* Stat Cards */}
                    <div className="v-section">
                        <h4 className="v-section__title">{t('settings.design_system_stats_label')}</h4>
                        <div className="v-section__content">
                            <div className="stat-grid">
                                <StatCard icon={<Users size={16} />} label="Users" value="24" color="var(--primary)" />
                                <StatCard icon={<Activity size={16} />} label="Events" value="1.4k" color="var(--status-safe)" />
                                <StatCard icon={<ShieldAlert size={16} />} label="Alerts" value="7" color="var(--status-risk)" />
                                <StatCard icon={<Search size={16} />} label="Searches" value="312" color="var(--text-muted)" />
                            </div>
                        </div>
                    </div>

                    {/* Loading States */}
                    <div className="v-section">
                        <h4 className="v-section__title">{t('settings.design_system_loading_label')}</h4>
                        <div className="v-section__content" style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="loader-pulse" />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>loader-pulse</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="loader-pulse" style={{ width: '1.5rem', height: '1.5rem' }} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>sm</span>
                            </div>
                        </div>
                    </div>

                    {/* Sections */}
                    <div className="v-section">
                        <h4 className="v-section__title">{t('settings.design_system_sections_label')}</h4>
                        <div className="v-section__content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="v-section--bordered" style={{ padding: '1rem' }}>
                                <h4 className="v-section__title">v-section--bordered</h4>
                                <div className="v-section__content">
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Seção com borda sutil — alternativa leve ao glass-panel.</span>
                                </div>
                            </div>
                            <div className="v-section--inset" style={{ padding: '1rem' }}>
                                <h4 className="v-section__title">v-section--inset</h4>
                                <div className="v-section__content">
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Seção com background sutil — separação visual leve.</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Page Layouts */}
                    <div className="v-section">
                        <h4 className="v-section__title">{t('settings.design_system_layouts_label')}</h4>
                        <div className="v-section__content">
                            <ul className="v-rule-list">
                                <li className="v-rule-item">
                                    <Layers3 size={18} aria-hidden="true" />
                                    <div>
                                        <strong>{t('settings.design_system_layout_console')}</strong>
                                        <span>Settings, Dashboard, Profile</span>
                                    </div>
                                </li>
                                <li className="v-rule-item">
                                    <Search size={18} aria-hidden="true" />
                                    <div>
                                        <strong>{t('settings.design_system_layout_workbench')}</strong>
                                        <span>Home, Hunting, Recon</span>
                                    </div>
                                </li>
                                <li className="v-rule-item">
                                    <Activity size={18} aria-hidden="true" />
                                    <div>
                                        <strong>{t('settings.design_system_layout_catalog')}</strong>
                                        <span>Feed, Watchlist</span>
                                    </div>
                                </li>
                                <li className="v-rule-item">
                                    <ShieldAlert size={18} aria-hidden="true" />
                                    <div>
                                        <strong>{t('settings.design_system_layout_focus')}</strong>
                                        <span>Login, MFA, Forgot/Reset Password</span>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </div>

                </div>
            </Panel>

            <Panel
                title={t('settings.design_system_usage_title')}
                description={t('settings.design_system_usage_body')}
            >
                <ul className="v-rule-list">
                    <li className="v-rule-item">
                        <Palette size={18} aria-hidden="true" />
                        <div>
                            <strong>{t('settings.design_system_rule_tokens_title')}</strong>
                            <span>{t('settings.design_system_rule_tokens_body')}</span>
                        </div>
                    </li>
                    <li className="v-rule-item">
                        <Layers3 size={18} aria-hidden="true" />
                        <div>
                            <strong>{t('settings.design_system_rule_shared_title')}</strong>
                            <span>{t('settings.design_system_rule_shared_body')}</span>
                        </div>
                    </li>
                    <li className="v-rule-item">
                        <ShieldAlert size={18} aria-hidden="true" />
                        <div>
                            <strong>{t('settings.design_system_rule_states_title')}</strong>
                            <span>{t('settings.design_system_rule_states_body')}</span>
                        </div>
                    </li>
                    <li className="v-rule-item">
                        <CheckCircle2 size={18} aria-hidden="true" />
                        <div>
                            <strong>{t('settings.design_system_rule_views_title')}</strong>
                            <span>{t('settings.design_system_rule_views_body')}</span>
                        </div>
                    </li>
                </ul>
            </Panel>
        </div>
    );
}
