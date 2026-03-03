/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import TOUR_STEPS from '../tour/tourSteps';
import { useAuth } from './AuthContext';

const TourContext = createContext(null);

const STORAGE_PREFIX = 'tour_completed_v1_';

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

    // Filter steps based on user role
    const steps = useMemo(() => {
        if (!user) return [];
        return TOUR_STEPS.filter(
            (s) => s.roles === null || s.roles.includes(user.role),
        );
    }, [user]);

    const storageKey = user ? `${STORAGE_PREFIX}${user.username ?? user._id}` : null;

    // Auto-start on first login
    useEffect(() => {
        if (!user || !storageKey) return;
        const completed = localStorage.getItem(storageKey);
        if (!completed) {
            // Delay so the login transition animation finishes first
            const timer = setTimeout(() => {
                setCurrentStepIndex(0);
                setIsTourActive(true);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [user, storageKey]);

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
        setCurrentStepIndex(0);
        markComplete();
    }, [markComplete]);

    const restartTour = useCallback(() => {
        if (storageKey) localStorage.removeItem(storageKey);
        setCurrentStepIndex(0);
        setIsTourActive(true);
    }, [storageKey]);

    const currentStep = steps[currentStepIndex] ?? null;

    const value = useMemo(
        () => ({
            isTourActive,
            currentStep,
            currentStepIndex,
            totalSteps: steps.length,
            nextStep,
            prevStep,
            skipTour,
            restartTour,
        }),
        [isTourActive, currentStep, currentStepIndex, steps.length, nextStep, prevStep, skipTour, restartTour],
    );

    return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};

export const useTour = () => useContext(TourContext);
