import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const response = await fetch('http://localhost:8000/api/auth/me', {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    if (response.ok) {
                        const userData = await response.json();
                        setUser(userData);
                    } else {
                        localStorage.removeItem('token');
                    }
                } catch (error) {
                    console.error('Auth initialization error:', error);
                }
            }
            setLoading(false);
        };
        initAuth();
    }, []);

    // IAM Auto-Logout on Inactivity (15 minutes)
    const inactivityTimeoutRef = useRef(null);

    useEffect(() => {
        const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

        const resetInactivityTimeout = () => {
            if (inactivityTimeoutRef.current) {
                clearTimeout(inactivityTimeoutRef.current);
            }
            if (user) {
                inactivityTimeoutRef.current = setTimeout(() => {
                    console.warn("Sessão expirada por inatividade. Forçando logoff (IAM Policy).");
                    logout();
                    alert("Sua sessão expirou por inatividade. Por favor, faça login novamente.");
                }, INACTIVITY_LIMIT_MS);
            }
        };

        const handleActivity = () => {
            resetInactivityTimeout();
        };

        // Attach listeners only if user is logged in
        if (user) {
            window.addEventListener('mousemove', handleActivity);
            window.addEventListener('keypress', handleActivity);
            window.addEventListener('click', handleActivity);
            window.addEventListener('scroll', handleActivity);

            // Start the timer
            resetInactivityTimeout();
        }

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keypress', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('scroll', handleActivity);
            if (inactivityTimeoutRef.current) {
                clearTimeout(inactivityTimeoutRef.current);
            }
        };
    }, [user]);

    const login = async (username, password) => {
        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch('http://localhost:8000/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Credenciais inválidas');
            }

            const data = await response.json();
            localStorage.setItem('token', data.access_token);

            // Fetch detailed user info
            const userResponse = await fetch('http://localhost:8000/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${data.access_token}`
                }
            });
            const userData = await userResponse.json();
            setUser(userData);
            return true;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
    };

    const updateUserContext = (newUser) => {
        setUser(newUser);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, updateUserContext }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
