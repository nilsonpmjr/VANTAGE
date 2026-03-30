/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from './ToastContext';
import API_URL from '../config';

const AuthContext = createContext(null);

/**
 * Fetches the current user from /api/auth/me.
 * Retries with /api/auth/refresh on 401 before giving up.
 * Returns the user object or null.
 */
async function fetchCurrentUser() {
    const meRes = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });

    if (meRes.ok) {
        return await meRes.json();
    }

    if (meRes.status === 401) {
        // Attempt silent refresh
        const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });
        if (refreshRes.ok) {
            const retryRes = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
            if (retryRes.ok) return await retryRes.json();
        }
    }

    return null;
}

export const AuthProvider = ({ children }) => {
    const { t } = useTranslation();
    const { addToast } = useToast();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isFadingOut, setIsFadingOut] = useState(false);
    const [mfaPending, setMfaPending] = useState(null); // truthy when MFA step is pending
    const [mfaSetupRequired, setMfaSetupRequired] = useState(false);

    // Initialize auth state from cookie on page load
    useEffect(() => {
        fetchCurrentUser()
            .then(setUser)
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    const logout = useCallback(async () => {
        try {
            await fetch(`${API_URL}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch {
            // Best-effort: clear local state regardless
        }
        setUser(null);
    }, []);

    // IAM Auto-Logout on Inactivity (30 minutes — MFA adds extra security layer)
    const inactivityTimeoutRef = useRef(null);

    useEffect(() => {
        const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;

        const resetInactivityTimeout = () => {
            if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
            if (user) {
                inactivityTimeoutRef.current = setTimeout(() => {
                    console.warn('Session expired due to inactivity. Forcing logout (IAM Policy).');
                    logout();
                    addToast(t('auth.session_expired', 'Your session has expired due to inactivity. Please log in again.'), 'warning');
                }, INACTIVITY_LIMIT_MS);
            }
        };

        if (user) {
            const events = ['mousemove', 'keypress', 'click', 'scroll'];
            events.forEach(e => window.addEventListener(e, resetInactivityTimeout));
            resetInactivityTimeout();
            return () => {
                events.forEach(e => window.removeEventListener(e, resetInactivityTimeout));
                if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
            };
        }
    }, [user, logout, addToast, t]);

    const login = async (username, password) => {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
        });

        if (!response.ok) {
            if (response.status === 423) {
                const errData = await response.json().catch(() => ({}));
                const err = new Error('account_locked');
                err.code = 'account_locked';
                err.locked_until = errData?.detail?.locked_until ?? null;
                throw err;
            }
            throw new Error('invalid_credentials');
        }

        const data = await response.json();

        // MFA required — the server keeps the pre-auth token in an HttpOnly cookie.
        if (data.mfa_required) {
            setMfaPending({ required: true });
            return false;
        }

        // Cookies are set by the server; just update local state
        if (data.user?.mfa_setup_required) setMfaSetupRequired(true);
        setIsTransitioning(true);
        setUser(data.user);

        setTimeout(() => setIsFadingOut(true), 200);
        setTimeout(() => {
            setIsTransitioning(false);
            setIsFadingOut(false);
        }, 1400);

        return true;
    };

    const updateUserContext = (newUser) => setUser(newUser);

    const completeMfaLogin = (userData) => {
        setMfaPending(null);
        setIsTransitioning(true);
        setUser(userData);
        setTimeout(() => setIsFadingOut(true), 200);
        setTimeout(() => {
            setIsTransitioning(false);
            setIsFadingOut(false);
        }, 1400);
    };

    const cancelMfa = () => {
        setMfaPending(null);
        setMfaSetupRequired(false);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, updateUserContext, isTransitioning, isFadingOut, mfaPending, mfaSetupRequired, setMfaSetupRequired, completeMfaLogin, cancelMfa }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
