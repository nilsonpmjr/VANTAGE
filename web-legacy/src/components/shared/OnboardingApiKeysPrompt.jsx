import React from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmModal from './ConfirmModal';

export default function OnboardingApiKeysPrompt({ open, onConfigureNow, onContinueTour }) {
    const { t } = useTranslation();

    if (!open) return null;

    return (
        <ConfirmModal
            title={t('tour.onboarding_title')}
            message={t('tour.onboarding_desc')}
            onConfirm={onConfigureNow}
            onCancel={onContinueTour}
            confirmLabel={t('tour.onboarding_configure')}
            cancelLabel={t('tour.onboarding_continue')}
        />
    );
}
