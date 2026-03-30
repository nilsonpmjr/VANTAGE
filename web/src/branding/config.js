/**
 * Brand configuration shared by runtime assets and public metadata.
 */

export const brands = {
  vantage: {
    key: 'vantage',
    name: 'VANTAGE',
    tagline: 'Cybersecurity Platform',
    appTitle: 'VANTAGE | Cybersecurity Platform',
    metaDescription: 'VANTAGE is a cybersecurity platform for threat intelligence, SOC workflows, and recon analysis.',
    logoPath: '/branding/vantage/logo-dark.png',
    logoDarkPath: '/branding/vantage/logo-dark.png',
    logoLightPath: '/branding/vantage/logo-light.png',
    logoCompactPath: '/branding/vantage/logo-compact.svg',
    faviconPath: '/branding/vantage/favicon.svg',
    appleTouchIconPath: '/branding/vantage/favicon.png',
    appIconDarkPath: '/branding/vantage/app-icon-dark.svg',
    appIconLightPath: '/branding/vantage/app-icon-light.svg',
    themes: ['dark', 'light'],
    defaultTheme: 'dark',
    copyrightHolder: 'VANTAGE',
    pdfPrefix: 'Vantage_ThreatReport',
    mfaIssuer: 'VANTAGE',
  },
  generic: {
    key: 'generic',
    name: 'Generic Platform',
    tagline: 'Security Operations Platform',
    appTitle: 'Generic Platform | Security Operations Platform',
    metaDescription: 'Generic security operations platform for downstream deployments, threat intelligence workflows, and recon analysis.',
    logoPath: '/branding/generic/logo.svg',
    logoDarkPath: '/branding/generic/logo.svg',
    logoLightPath: '/branding/generic/logo-light.svg',
    logoCompactPath: '/branding/generic/logo-compact.svg',
    faviconPath: '/branding/generic/favicon.svg',
    appleTouchIconPath: '/branding/generic/app-icon-light.svg',
    appIconDarkPath: '/branding/generic/app-icon-dark.svg',
    appIconLightPath: '/branding/generic/app-icon-light.svg',
    themes: ['dark', 'light'],
    defaultTheme: 'dark',
    copyrightHolder: 'Generic Platform',
    pdfPrefix: 'Security_Report',
    mfaIssuer: 'Generic Platform',
  },
};

const requestedBrandKey = import.meta.env.VITE_BRAND?.trim().toLowerCase();
export const ACTIVE_BRAND_KEY = requestedBrandKey && requestedBrandKey in brands
  ? requestedBrandKey
  : 'vantage';

const brand = brands[ACTIVE_BRAND_KEY] ?? brands.vantage;

export default brand;
