import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';

/**
 * Custom hook to safely listen to Tauri backend events with automatic cleanup
 * and protection against promise resolution race conditions on rapid unmount.
 *
 * @param eventName The name of the Tauri event to listen for
 * @param handler Callback invoked when the event is received
 * @param enabled Optional boolean to toggle listener on/off (defaults to true)
 */
export function useTauriEvent<T = any>(
    eventName: string,
    handler: (payload: T, event: Event<T>) => void | Promise<void>,
    enabled: boolean = true
) {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!enabled) return;

        let isMounted = true;
        let unlistenFn: UnlistenFn | null = null;

        listen<T>(eventName, (event) => {
            if (isMounted && handlerRef.current) {
                handlerRef.current(event.payload, event);
            }
        })
            .then((unsub) => {
                if (isMounted) {
                    unlistenFn = unsub;
                } else {
                    // Component already unmounted before listen promise resolved
                    unsub();
                }
            })
            .catch((err) => {
                console.error(`[useTauriEvent] Error registering listener for '${eventName}':`, err);
            });

        return () => {
            isMounted = false;
            if (unlistenFn) {
                unlistenFn();
                unlistenFn = null;
            }
        };
    }, [eventName, enabled]);
}
