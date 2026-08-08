import { useEffect } from 'react';

/**
 * Sets `data-idle="true"` on `<html>` when the window is hidden (minimized,
 * alt-tabbed, etc.) and removes it when the window regains focus.
 *
 * CSS rules keyed off `[data-idle="true"]` automatically pause all ambient
 * animations, saving significant GPU compositing work.
 *
 * Mount this hook once at the layout level.
 */
export function useIdleAnimations(): void {
    useEffect(() => {
        const root = document.documentElement;

        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                root.setAttribute('data-idle', 'true');
            } else {
                root.removeAttribute('data-idle');
            }
        };

        // Set initial state
        onVisibilityChange();

        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            root.removeAttribute('data-idle');
        };
    }, []);
}

/**
 * Returns true when the document is visible (not minimized / not hidden tab).
 * Use inside setInterval callbacks to skip expensive work when the user
 * isn't looking at the app.
 */
export function isAppVisible(): boolean {
    return document.visibilityState === 'visible';
}
