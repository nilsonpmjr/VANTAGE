import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Lock, Webhook, ClipboardList, ShieldCheck, Monitor, Key, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SettingsShell from './layout/SettingsShell';
import MFAEnroll from './auth/MFAEnroll';
import SessionsTable from './shared/SessionsTable';
import ApiKeysManager from './shared/ApiKeysManager';
import SectionHeader from './shared/SectionHeader';
import ProfileInfoPanel from './profile/ProfileInfoPanel';
import ProfileLanguagePanel from './profile/ProfileLanguagePanel';
import ProfilePasswordPanel from './profile/ProfilePasswordPanel';
import ProfileAuditPanel from './profile/ProfileAuditPanel';
import ProfileTourPanel from './profile/ProfileTourPanel';
import ThirdPartyKeysManager from './profile/ThirdPartyKeysManager';
import API_URL from '../config';
import '../index.css';

export default function Profile() {
    const { user, updateUserContext, setMfaSetupRequired } = useAuth();
    const { t } = useTranslation();
    const [mfaEnabled, setMfaEnabled] = useState(user?.mfa_enabled || false);
    const [activeKey, setActiveKey] = useState('info');

    const menuGroups = useMemo(() => [
        {
            key: 'account_group',
            label: t('profile.menu_account'),
            items: [
                { key: 'info', icon: <User size={16} />, label: t('profile.menu_info') },
                { key: 'language', icon: <Webhook size={16} />, label: t('profile.menu_language') },
            ],
        },
        {
            key: 'security_group',
            label: t('profile.menu_security'),
            items: [
                { key: 'password', icon: <Lock size={16} />, label: t('profile.menu_password') },
                { key: 'mfa', icon: <ShieldCheck size={16} />, label: t('profile.menu_mfa') },
                { key: 'sessions', icon: <Monitor size={16} />, label: t('profile.menu_sessions') },
            ],
        },
        {
            key: 'integration_group',
            label: t('profile.menu_integration'),
            items: [
                { key: 'api_keys', icon: <Key size={16} />, label: t('profile.menu_api_keys') },
                { key: 'third_party_keys', icon: <Key size={16} />, label: t('third_party_keys.menu_third_party') },
            ],
        },
        {
            key: 'history_group',
            label: t('profile.menu_history'),
            items: [
                { key: 'audit', icon: <ClipboardList size={16} />, label: t('profile.menu_audit') },
            ],
        },
        { key: 'tour', icon: <RotateCcw size={16} />, label: t('profile.menu_tour') },
    ], [t]);

    const breadcrumbs = useMemo(() => {
        const labels = {
            info:     { parent: t('profile.menu_account'),     label: t('profile.menu_info') },
            language: { parent: t('profile.menu_account'),     label: t('profile.menu_language') },
            password: { parent: t('profile.menu_security'),    label: t('profile.menu_password') },
            mfa:      { parent: t('profile.menu_security'),    label: t('profile.menu_mfa') },
            sessions: { parent: t('profile.menu_security'),    label: t('profile.menu_sessions') },
            api_keys: { parent: t('profile.menu_integration'), label: t('profile.menu_api_keys') },
            third_party_keys: { parent: t('profile.menu_integration'), label: t('third_party_keys.menu_third_party') },
            audit:    { parent: t('profile.menu_history'),     label: t('profile.menu_audit') },
            tour:     { label: t('profile.menu_tour') },
        };
        const crumbs = [{ label: t('profile.title'), onClick: () => setActiveKey('info') }];
        const info = labels[activeKey] || { label: activeKey };
        if (info.parent) crumbs.push({ label: info.parent });
        crumbs.push({ label: info.label });
        return crumbs;
    }, [activeKey, t]);

    // Notices shared across info/language/password panels
    const notices = user && (user.force_password_reset || user.password_expires_in_days === 0) ? (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--status-risk)', color: 'var(--status-risk)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={18} />
            <strong>{user.force_password_reset ? t('auth.force_reset_notice') : t('auth.password_expired_notice')}</strong>
        </div>
    ) : null;

    const handleMfaStatusChange = async () => {
        try {
            const resp = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
            if (resp.ok) {
                const freshUser = await resp.json();
                setMfaEnabled(freshUser.mfa_enabled || false);
                if (updateUserContext) updateUserContext(freshUser);
                if (setMfaSetupRequired) setMfaSetupRequired(false);
            }
        } catch { /* non-critical */ }
    };

    return (
        <SettingsShell groups={menuGroups} activeKey={activeKey} onSelect={setActiveKey} breadcrumbs={breadcrumbs}>

            {activeKey === 'info'     && <ProfileInfoPanel notices={notices} />}
            {activeKey === 'language' && <ProfileLanguagePanel notices={notices} />}
            {activeKey === 'password' && <ProfilePasswordPanel notices={notices} />}
            {activeKey === 'audit'    && <ProfileAuditPanel />}
            {activeKey === 'tour'     && <ProfileTourPanel />}
            {activeKey === 'mfa' && (
                <div className="fade-in">
                    <SectionHeader icon={<ShieldCheck size={22} color="var(--primary)" />} title={t('mfa.section_title')} subtitle={t('mfa.section_sub')} />
                    <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px' }}>
                        <MFAEnroll mfaEnabled={mfaEnabled} userRole={user?.role} onStatusChange={handleMfaStatusChange} />
                    </div>
                </div>
            )}

            {activeKey === 'sessions' && (
                <div className="fade-in">
                    <SectionHeader icon={<Monitor size={22} color="var(--primary)" />} title={t('sessions.section_title')} subtitle={t('sessions.subtitle')} />
                    <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px' }}>
                        <SessionsTable />
                    </div>
                </div>
            )}

            {activeKey === 'api_keys' && (
                <div className="fade-in">
                    <SectionHeader icon={<Key size={22} color="var(--primary)" />} title={t('api_keys.section_title')} subtitle={t('api_keys.subtitle')} />
                    <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px' }}>
                        <ApiKeysManager />
                    </div>
                </div>
            )}

            {activeKey === 'third_party_keys' && (
                <div className="fade-in">
                    <SectionHeader icon={<Key size={22} color="var(--primary)" />} title={t('third_party_keys.section_title')} subtitle={t('third_party_keys.subtitle')} />
                    <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px' }}>
                        <ThirdPartyKeysManager />
                    </div>
                </div>
            )}

        </SettingsShell>
    );
}
