export function shouldHandleSearchShortcut(currentView, event) {
    if (!['home', 'search'].includes(currentView)) return false;
    if (!(event.ctrlKey || event.metaKey)) return false;
    return event.key?.toLowerCase() === 'l';
}
