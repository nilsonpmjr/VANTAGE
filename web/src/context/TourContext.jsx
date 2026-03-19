/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import TOUR_STEPS from '../tour/tourSteps';
import { useAuth } from './AuthContext';

const TourContext = createContext(null);

const STORAGE_PREFIX = 'tour_completed_v1_';
const ONBOARDING_PREFIX = 'tour_onboarding_v1_';

/**
 * TourProvider — manages guided-tour state.
 *
 * Automatically starts the tour on first login (per user) by checking
 * localStorage.  Exposes helpers to navigate, skip, or restart the tour.
 */
export const TourProvider = ({ children }) => {
    const { user } = useAuth();

    const [isTourActive, setIsTourActive] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isOnboardingPromptVisible, setIsOnboardingPromptVisible] = useState(false);

    // Filter steps based on user role
    const steps = useMemo(() => {
        if (!user) return [];
        return TOUR_STEPS.filter(
            (s) => s.roles === null || s.roles.includes(user.role),
        );
    }, [user]);

    const storageKey = user ? `${STORAGE_PREFIX}${user.username ?? user._id}` : null;
    const onboardingKey = user ? `${ONBOARDING_PREFIX}${user.username ?? user._id}` : null;

    const startTour = useCallback(() => {
        setIsOnboardingPromptVisible(false);
        setCurrentStepIndex(0);
        setIsTourActive(true);
    }, []);

    // Auto-start on first login — skip if password reset is required
    useEffect(() => {
        if (!user || !storageKey) return;
        setIsOnboardingPromptVisible(false);
        // Don't start tour when user must change password first
        if (user.force_password_reset || user.password_expires_in_days === 0) return;
        const completed = localStorage.getItem(storageKey);
        if (completed) return;

        const onboardingChoice = onboardingKey ? localStorage.getItem(onboardingKey) : null;
        const timer = setTimeout(() => {
            if (onboardingChoice === 'tour') {
                startTour();
                return;
            }
            if (!onboardingChoice) {
                setIsOnboardingPromptVisible(true);
            }
        }, 1000);

        return () => clearTimeout(timer);
    }, [user, storageKey, onboardingKey, startTour]);

    const markComplete = useCallback(() => {
        if (storageKey) localStorage.setItem(storageKey, 'true');
    }, [storageKey]);

    const nextStep = useCallback(() => {
        setCurrentStepIndex((prev) => {
            if (prev + 1 >= steps.length) {
                setIsTourActive(false);
                markComplete();
                return 0;
            }
            return prev + 1;
        });
    }, [steps.length, markComplete]);

    const prevStep = useCallback(() => {
        setCurrentStepIndex((prev) => Math.max(0, prev - 1));
    }, []);

    const skipTour = useCallback(() => {
        setIsTourActive(false);
        setIsOnboardingPromptVisible(false);
        setCurrentStepIndex(0);
        markComplete();
    }, [markComplete]);

    const restartTour = useCallback(() => {
        if (storageKey) localStorage.removeItem(storageKey);
        startTour();
    }, [storageKey, startTour]);

    const acceptOnboardingPrompt = useCallback(() => {
        if (onboardingKey) localStorage.setItem(onboardingKey, 'api_keys');
        setIsOnboardingPromptVisible(false);
    }, [onboardingKey]);

    const declineOnboardingPrompt = useCallback(() => {
        if (onboardingKey) localStorage.setItem(onboardingKey, 'tour');
        startTour();
    }, [onboardingKey, startTour]);

    const currentStep = steps[currentStepIndex] ?? null;

    const value = useMemo(
        () => ({
            isTourActive,
            isOnboardingPromptVisible,
            currentStep,
            currentStepIndex,
            totalSteps: steps.length,
            nextStep,
            prevStep,
            skipTour,
            restartTour,
            acceptOnboardingPrompt,
            declineOnboardingPrompt,
        }),
        [
            isTourActive,
            isOnboardingPromptVisible,
            currentStep,
            currentStepIndex,
            steps.length,
            nextStep,
            prevStep,
            skipTour,
            restartTour,
            acceptOnboardingPrompt,
            declineOnboardingPrompt,
        ],
    );

    return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};

export const useTour = () => useContext(TourContext);
