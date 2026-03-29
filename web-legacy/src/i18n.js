import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import pt from './locales/pt.json';
import en from './locales/en.json';
import es from './locales/es.json';

const resources = {
    pt: { translation: pt },
    en: { translation: en },
    es: { translation: es }
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: 'pt', // Default Language 
        fallbackLng: 'pt',
        interpolation: {
            escapeValue: false // React already safes from XSS
        }
    });

export default i18n;
