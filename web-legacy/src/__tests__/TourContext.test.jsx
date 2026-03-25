import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourProvider, useTour } from '../context/TourContext';

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: {
            _id: 'user-1',
            username: 'analyst',
            role: 'tech',
            force_password_reset: false,
            password_expires_in_days: 30,
        },
    }),
}));

function TourProbe() {
    const {
        isTourActive,
        isOnboardingPromptVisible,
        currentStep,
        acceptOnboardingPrompt,
        declineOnboardingPrompt,
    } = useTour();

    return (
        <div>
            <span data-testid="tour-active">{String(isTourActive)}</span>
            <span data-testid="prompt-visible">{String(isOnboardingPromptVisible)}</span>
            <span data-testid="current-target">{currentStep?.target ?? 'none'}</span>
            <button onClick={acceptOnboardingPrompt}>accept</button>
            <button onClick={declineOnboardingPrompt}>decline</button>
        </div>
    );
}

describe('TourContext onboarding flow', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not auto-start the tour before the user makes an onboarding choice', () => {
        render(
            <TourProvider>
                <TourProbe />
            </TourProvider>,
        );

        expect(screen.getByTestId('tour-active').textContent).toBe('false');
        expect(screen.getByTestId('prompt-visible').textContent).toBe('false');
    });

    it('starts the tour when the user declines the prompt', () => {
        render(
            <TourProvider>
                <TourProbe />
            </TourProvider>,
        );

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        fireEvent.click(screen.getByText('decline'));

        expect(screen.getByTestId('prompt-visible').textContent).toBe('false');
        expect(screen.getByTestId('tour-active').textContent).toBe('true');
        expect(screen.getByTestId('current-target').textContent).toBe('search-bar');
        expect(localStorage.getItem('tour_onboarding_v1_analyst')).toBe('tour');
    });

    it('stores the API-key choice without starting the tour immediately', () => {
        render(
            <TourProvider>
                <TourProbe />
            </TourProvider>,
        );

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        fireEvent.click(screen.getByText('accept'));

        expect(screen.getByTestId('prompt-visible').textContent).toBe('false');
        expect(screen.getByTestId('tour-active').textContent).toBe('false');
        expect(localStorage.getItem('tour_onboarding_v1_analyst')).toBe('api_keys');
    });
});
