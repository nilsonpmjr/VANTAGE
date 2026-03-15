import React from 'react';
import { CheckCircle2, Layers3, Palette, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../shared/SectionHeader';
import FormField from '../shared/FormField';
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
