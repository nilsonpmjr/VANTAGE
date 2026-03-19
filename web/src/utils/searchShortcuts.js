export function shouldHandleSearchShortcut(currentView, event) {
    if (currentView !== 'home') return false;
    if (!(event.ctrlKey || event.metaKey)) return false;
    return event.key?.toLowerCase() === 'l';
}
