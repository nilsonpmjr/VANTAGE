import React from 'react';
import { ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AuditLogTable from './AuditLogTable';
import SectionHeader from '../shared/SectionHeader';

export default function AuditLogPanel() {
    const { t } = useTranslation();
    return (
        <div className="fade-in">
            <SectionHeader
                icon={<ClipboardList size={22} color="var(--primary)" />}
                title={t('settings.tab_audit')}
            />
            <AuditLogTable />
        </div>
    );
}
