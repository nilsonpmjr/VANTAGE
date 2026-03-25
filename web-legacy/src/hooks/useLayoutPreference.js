import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'vantage-layout';
const listeners = new Set();

function getSnapshot() {
    try {
        return window.localStorage.getItem(STORAGE_KEY) || 'sidebar';
    } catch {
        return 'sidebar';
    }
}

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function setLayoutState(layout) {
    try {
        window.localStorage.setItem(STORAGE_KEY, layout);
        document.body.dataset.layout = layout;
    } catch {
        // ignore
    }
    listeners.forEach(l => l());
}

export function useLayoutPreference() {
    const layout = useSyncExternalStore(subscribe, getSnapshot, () => 'sidebar');

    const toggleLayout = () => {
        setLayoutState(layout === 'sidebar' ? 'topbar' : 'sidebar');
    };

    return { layout, setLayout: setLayoutState, toggleLayout };
}
