import brand from './config';

export const THEME_STORAGE_KEY = `branding.${brand.key}.theme`;
const themeListeners = new Set();

function safeGetTheme() {
    try {
        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (brand.themes.includes(storedTheme)) {
            return storedTheme;
        }
    } catch {
        // If storage is unavailable, use the default theme.
    }

    return brand.defaultTheme;
}

function notifyThemeListeners() {
    themeListeners.forEach((listener) => listener());
}

function syncHeadBranding() {
    if (typeof document === 'undefined') {
        return;
    }

    const favicon = document.querySelector("link[rel='icon']");
    if (favicon) {
        favicon.setAttribute('href', brand.faviconPath);
    }

    const appleTouchIcon = document.querySelector("link[rel='apple-touch-icon']");
    if (appleTouchIcon) {
        appleTouchIcon.setAttribute('href', brand.appleTouchIconPath || brand.faviconPath);
    }

    const description = document.querySelector("meta[name='description']");
    if (description) {
        description.setAttribute('content', brand.metaDescription);
    }

    if (brand.appTitle) {
        document.title = brand.appTitle;
    }
}

export function getActiveTheme(target = document.documentElement) {
    return target?.dataset?.theme || safeGetTheme();
}

export function getBrandAssets(theme = getActiveTheme()) {
    const isLight = theme === 'light';

    return {
        logoPath: isLight ? (brand.logoLightPath || brand.logoPath) : (brand.logoDarkPath || brand.logoPath),
        logoCompactPath: brand.logoCompactPath,
        faviconPath: brand.faviconPath,
        appIconPath: isLight ? (brand.appIconLightPath || brand.appIconDarkPath) : (brand.appIconDarkPath || brand.appIconLightPath),
    };
}

export function subscribeTheme(listener) {
    themeListeners.add(listener);
    return () => themeListeners.delete(listener);
}

export function applyBrandTheme(target = document.documentElement) {
    const theme = safeGetTheme();

    target.dataset.brand = brand.key;
    target.dataset.theme = theme;
    target.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    syncHeadBranding();
    notifyThemeListeners();

    return { brand: brand.key, theme };
}

export function setTheme(theme, target = document.documentElement) {
    if (!brand.themes.includes(theme)) {
        return false;
    }

    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Apply the theme for this session even if persistence fails.
    }

    target.dataset.theme = theme;
    target.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    syncHeadBranding();
    notifyThemeListeners();
    return true;
}
