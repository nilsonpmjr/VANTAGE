import React from 'react';
import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTour } from '../../context/TourContext';
import SectionHeader from '../shared/SectionHeader';

export default function ProfileTourPanel() {
    const { t } = useTranslation();
    const { restartTour } = useTour();

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<RotateCcw size={22} color="var(--primary)" />}
                title={t('profile.restart_tour')}
                subtitle={t('profile.restart_tour_sub')}
            />
            <div className="glass-panel" style={{ padding: '1.5rem 2rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('profile.restart_tour_sub')}</p>
                <button
                    className="btn-secondary"
                    onClick={restartTour}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}
                >
                    <RotateCcw size={14} />
                    {t('profile.restart_tour_btn')}
                </button>
            </div>
        </div>
    );
}
