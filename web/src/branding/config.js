/**
 * Branding configuration (ponto único de verdade)
 *
 * Para downstream, a marca ativa pode ser definida com VITE_BRAND.
 * Os temas seguem centralizados por brand.themes/defaultTheme.
 */

export const brands = {
  vantage: {
    key: 'vantage',
    name: 'VANTAGE',
    tagline: 'Cybersecurity Platform',
    appTitle: 'VANTAGE | Cybersecurity Platform',
    metaDescription: 'VANTAGE is a cybersecurity platform for threat intelligence, SOC workflows, and recon analysis.',
    logoPath: '/branding/vantage/logo.svg',
    logoDarkPath: '/branding/vantage/logo.svg',
    logoLightPath: '/branding/vantage/logo-light.svg',
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
    name: 'Workspace',
    tagline: 'Security Operations Platform',
    appTitle: 'Workspace | Security Operations Platform',
    metaDescription: 'Generic security operations workspace for downstream deployments, threat intelligence workflows, and recon analysis.',
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
    copyrightHolder: 'Workspace',
    pdfPrefix: 'Security_Report',
    mfaIssuer: 'Workspace',
  },
};

const requestedBrandKey = import.meta.env.VITE_BRAND?.trim().toLowerCase();
export const ACTIVE_BRAND_KEY = requestedBrandKey && requestedBrandKey in brands
  ? requestedBrandKey
  : 'vantage';

const brand = brands[ACTIVE_BRAND_KEY] ?? brands.vantage;

export default brand;
