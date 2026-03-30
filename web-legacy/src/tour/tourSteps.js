/**
 * Tour step definitions.
 * Each step maps to a data-tour attribute on a DOM element.
 *
 * Fields:
 *   target      – value of the data-tour attribute on the target element
 *   titleKey    – i18n key for the step title
 *   descKey     – i18n key for the step description
 *   position    – preferred tooltip position (top | bottom | left | right)
 *   roles       – which user roles see this step (null = everyone)
 *   sidebarMustOpen – if true, the sidebar is expanded before showing step
 */

const TOUR_STEPS = [
    {
        target: 'search-bar',
        titleKey: 'tour.search_title',
        descKey: 'tour.search_desc',
        position: 'bottom',
        roles: null,
    },
    {
        target: 'lang-select',
        titleKey: 'tour.lang_title',
        descKey: 'tour.lang_desc',
        position: 'bottom',
        roles: null,
    },
    {
        target: 'sidebar-toggle',
        titleKey: 'tour.sidebar_title',
        descKey: 'tour.sidebar_desc',
        position: 'right',
        roles: null,
        sidebarMustOpen: true,
    },
    {
        target: 'sidebar-home',
        titleKey: 'tour.home_title',
        descKey: 'tour.home_desc',
        position: 'right',
        roles: ['admin', 'manager', 'tech'],
        sidebarMustOpen: true,
    },
    {
        target: 'sidebar-feed',
        titleKey: 'tour.feed_title',
        descKey: 'tour.feed_desc',
        position: 'right',
        roles: ['admin', 'manager', 'tech'],
        sidebarMustOpen: true,
    },
    {
        target: 'sidebar-profile',
        titleKey: 'tour.profile_title',
        descKey: 'tour.profile_desc',
        position: 'right',
        roles: null,
        sidebarMustOpen: true,
    },
    {
        target: 'sidebar-recon',
        titleKey: 'tour.recon_title',
        descKey: 'tour.recon_desc',
        position: 'right',
        roles: ['admin', 'manager', 'tech'],
        sidebarMustOpen: true,
    },
    {
        target: 'sidebar-watchlist',
        titleKey: 'tour.watchlist_title',
        descKey: 'tour.watchlist_desc',
        position: 'right',
        roles: ['admin', 'manager', 'tech'],
        sidebarMustOpen: true,
    },
    {
        target: 'sidebar-dashboard',
        titleKey: 'tour.dashboard_title',
        descKey: 'tour.dashboard_desc',
        position: 'right',
        roles: ['admin', 'manager', 'tech'],
        sidebarMustOpen: true,
    },
    {
        target: 'sidebar-settings',
        titleKey: 'tour.settings_title',
        descKey: 'tour.settings_desc',
        position: 'right',
        roles: ['admin'],
        sidebarMustOpen: true,
    },
];

export default TOUR_STEPS;
