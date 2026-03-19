import React, { useEffect, useState } from 'react';
import { Loader, Mail, Send, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';
import FormField from '../shared/FormField';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Panel from '../ui/Panel';
import Input from '../ui/Input';

const EMPTY_FORM = {
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    tls: true,
};

function SourceBadge({ source }) {
    const variantMap = {
        persisted: 'primary',
        env: 'warning',
        default: 'neutral',
    };

    return <Badge variant={variantMap[source] || 'neutral'}>{source}</Badge>;
}

export default function SMTPControlPanel() {
    const { t } = useTranslation();
    const [form, setForm] = useState(EMPTY_FORM);
    const [smtpMeta, setSmtpMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [disabling, setDisabling] = useState(false);
    const [message, setMessage] = useState('');
    const [messageTone, setMessageTone] = useState('success');
    const [testTarget, setTestTarget] = useState('');

    const showMessage = (text, tone = 'success') => {
        setMessage(text);
        setMessageTone(tone);
    };

    const loadSmtpConfig = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/admin/operational-config/smtp`, {
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.smtp_load_error'));
            }
            setSmtpMeta(data);
            setForm({
                host: data.host?.value || '',
                port: data.port?.value || 587,
                username: data.username?.value || '',
                password: '',
                from_email: data.from?.value || '',
                tls: Boolean(data.tls?.value),
            });
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSmtpConfig();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');

        const payload = {
            host: form.host.trim(),
            port: Number(form.port) || 587,
            username: form.username.trim(),
            from_email: form.from_email.trim(),
            tls: form.tls,
        };
        if (form.password.trim()) {
            payload.password = form.password;
        }

        try {
            const response = await fetch(`${API_URL}/api/admin/operational-config/smtp`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.smtp_save_error'));
            }
            setSmtpMeta(data);
            setForm((current) => ({
                ...current,
                password: '',
                host: data.host?.value || '',
                port: data.port?.value || 587,
                username: data.username?.value || '',
                from_email: data.from?.value || '',
                tls: Boolean(data.tls?.value),
            }));
            showMessage(t('settings.smtp_saved'));
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setMessage('');
        try {
            const response = await fetch(`${API_URL}/api/admin/operational-config/smtp/test`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testTarget.trim() ? { to_email: testTarget.trim() } : {}),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.smtp_test_error'));
            }
            showMessage(t('settings.smtp_test_success', { email: data.to_email }));
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleDisable = async () => {
        if (!window.confirm(t('settings.smtp_disable_confirm'))) {
            return;
        }
        setDisabling(true);
        setMessage('');
        try {
            const response = await fetch(`${API_URL}/api/admin/operational-config/smtp`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: '',
                    username: '',
                    password: '',
                    from_email: form.from_email.trim() || 'noreply@soc.local',
                    tls: form.tls,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.smtp_disable_error'));
            }
            setSmtpMeta(data);
            setForm((current) => ({
                ...current,
                host: '',
                username: '',
                password: '',
            }));
            showMessage(t('settings.smtp_disabled'), 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setDisabling(false);
        }
    };

    const configured = Boolean(smtpMeta?.password?.configured && smtpMeta?.host?.value);

    return (
        <div className="v-page-stack fade-in">
            <SectionHeader
                icon={<Mail size={22} color="var(--primary)" />}
                title={t('settings.smtp_title')}
                subtitle={t('settings.smtp_subtitle')}
                actions={(
                    <div className="v-inline-row">
                        <Badge variant={configured ? 'success' : 'warning'}>
                            {configured ? t('settings.smtp_status_configured') : t('settings.smtp_status_disabled')}
                        </Badge>
                    </div>
                )}
            />

            {loading ? (
                <div className="control-plane-loading">
                    <Loader className="spin" size={24} color="var(--primary)" />
                </div>
            ) : (
                <div className="control-plane-grid">
                    <Panel
                        title={t('settings.smtp_form_title')}
                        description={t('settings.smtp_form_body')}
                        eyebrow={t('settings.smtp_eyebrow')}
                        actions={(
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={handleDisable}
                                loading={disabling}
                                iconLeading={<ShieldOff size={14} />}
                            >
                                {t('settings.smtp_disable')}
                            </Button>
                        )}
                    >
                        <form className="v-page-stack" onSubmit={handleSave}>
                            <div className="form-grid form-grid-2">
                                <FormField label={t('settings.smtp_host_label')} hint={t('settings.smtp_host_hint')} id="smtp-host">
                                    <Input
                                        id="smtp-host"
                                        value={form.host}
                                        onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))}
                                        placeholder="smtp.company.local"
                                    />
                                </FormField>
                                <FormField label={t('settings.smtp_port_label')} hint={t('settings.smtp_port_hint')} id="smtp-port">
                                    <Input
                                        id="smtp-port"
                                        type="number"
                                        min="1"
                                        max="65535"
                                        value={form.port}
                                        onChange={(event) => setForm((current) => ({ ...current, port: event.target.value }))}
                                    />
                                </FormField>
                                <FormField label={t('settings.smtp_user_label')} hint={t('settings.smtp_user_hint')} id="smtp-user">
                                    <Input
                                        id="smtp-user"
                                        value={form.username}
                                        onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                                        placeholder="alerts@company.local"
                                    />
                                </FormField>
                                <FormField label={t('settings.smtp_password_label')} hint={t('settings.smtp_password_hint')} id="smtp-password">
                                    <Input
                                        id="smtp-password"
                                        type="password"
                                        value={form.password}
                                        onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                                        placeholder="••••••••"
                                    />
                                </FormField>
                                <FormField label={t('settings.smtp_from_label')} hint={t('settings.smtp_from_hint')} id="smtp-from">
                                    <Input
                                        id="smtp-from"
                                        type="email"
                                        value={form.from_email}
                                        onChange={(event) => setForm((current) => ({ ...current, from_email: event.target.value }))}
                                        placeholder="noreply@soc.local"
                                    />
                                </FormField>
                                <div className="form-field">
                                    <span className="form-label">{t('settings.smtp_tls_label')}</span>
                                    <span className="form-hint">{t('settings.smtp_tls_hint')}</span>
                                    <button
                                        type="button"
                                        className={`toggle${form.tls ? ' active' : ''}`}
                                        aria-pressed={form.tls}
                                        onClick={() => setForm((current) => ({ ...current, tls: !current.tls }))}
                                    />
                                </div>
                            </div>

                            <div className="form-actions">
                                <Button
                                    type="submit"
                                    loading={saving}
                                    iconLeading={<Mail size={16} />}
                                >
                                    {t('settings.smtp_save')}
                                </Button>
                                {message ? <span className={`form-msg ${messageTone}`}>{message}</span> : null}
                            </div>
                        </form>
                    </Panel>

                    <div className="control-plane-stack">
                        <Panel
                            title={t('settings.smtp_state_title')}
                            description={t('settings.smtp_state_body')}
                            eyebrow={t('settings.smtp_eyebrow_runtime')}
                        >
                            <div className="smtp-state-list">
                                {[
                                    ['host', t('settings.smtp_host_label')],
                                    ['port', t('settings.smtp_port_label')],
                                    ['username', t('settings.smtp_user_label')],
                                    ['from', t('settings.smtp_from_label')],
                                    ['password', t('settings.smtp_password_label')],
                                    ['tls', t('settings.smtp_tls_label')],
                                ].map(([key, label]) => {
                                    const field = smtpMeta?.[key];
                                    const value = key === 'password'
                                        ? (field?.configured ? field?.masked : t('settings.smtp_not_configured'))
                                        : String(field?.value ?? '');
                                    return (
                                        <div className="smtp-state-row" key={key}>
                                            <div>
                                                <strong>{label}</strong>
                                                <span>{value || t('settings.smtp_not_configured')}</span>
                                            </div>
                                            <SourceBadge source={field?.source || 'default'} />
                                        </div>
                                    );
                                })}
                            </div>
                        </Panel>

                        <Panel
                            title={t('settings.smtp_test_title')}
                            description={t('settings.smtp_test_body')}
                            eyebrow={t('settings.smtp_eyebrow_validation')}
                            actions={(
                                <Button
                                    size="sm"
                                    onClick={handleTest}
                                    loading={testing}
                                    iconLeading={<Send size={14} />}
                                >
                                    {t('settings.smtp_test_action')}
                                </Button>
                            )}
                        >
                            <div className="v-page-stack">
                                <FormField label={t('settings.smtp_test_target_label')} hint={t('settings.smtp_test_target_hint')} id="smtp-test-target" fullWidth>
                                    <Input
                                        id="smtp-test-target"
                                        type="email"
                                        value={testTarget}
                                        onChange={(event) => setTestTarget(event.target.value)}
                                        placeholder="soc-admin@company.local"
                                    />
                                </FormField>
                                <div className="control-plane-note">
                                    <Badge variant="neutral">{t('settings.smtp_test_target_optional')}</Badge>
                                    <span>{t('settings.smtp_test_target_body')}</span>
                                </div>
                            </div>
                        </Panel>
                    </div>
                </div>
            )}
        </div>
    );
}
