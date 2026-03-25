import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OnboardingApiKeysPrompt from '../components/shared/OnboardingApiKeysPrompt';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
        i18n: { changeLanguage: vi.fn() },
    }),
}));

describe('OnboardingApiKeysPrompt', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <OnboardingApiKeysPrompt open={false} onConfigureNow={vi.fn()} onContinueTour={vi.fn()} />,
        );
        expect(container.innerHTML).toBe('');
    });

    it('renders the modal when open', () => {
        render(
            <OnboardingApiKeysPrompt open={true} onConfigureNow={vi.fn()} onContinueTour={vi.fn()} />,
        );
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('tour.onboarding_title')).toBeTruthy();
    });

    it('calls onConfigureNow when the configure button is clicked', () => {
        const onConfigure = vi.fn();
        render(
            <OnboardingApiKeysPrompt open={true} onConfigureNow={onConfigure} onContinueTour={vi.fn()} />,
        );
        fireEvent.click(screen.getByText('tour.onboarding_configure'));
        expect(onConfigure).toHaveBeenCalledOnce();
    });

    it('calls onContinueTour when the continue button is clicked', () => {
        const onContinue = vi.fn();
        render(
            <OnboardingApiKeysPrompt open={true} onConfigureNow={vi.fn()} onContinueTour={onContinue} />,
        );
        fireEvent.click(screen.getByText('tour.onboarding_continue'));
        expect(onContinue).toHaveBeenCalledOnce();
    });
});
