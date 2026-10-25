import { useState, useRef, InputHTMLAttributes } from 'react';

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'>;

interface NumberInputProps extends NativeProps {
    value: number | string | undefined | null;
    /** Called with a finite number while typing (as soon as the text is a valid number) and on blur */
    onValueChange: (value: number) => void;
    min?: number;
    max?: number;
    /** Round to whole numbers on blur */
    integer?: boolean;
}

// Accepts partial input such as "", "-", "0.", "0,0" while the user is still typing
const PARTIAL_NUMBER = /^-?\d*(?:[.,]\d*)?$/;

const toNumber = (text: string): number => parseFloat(text.replace(',', '.'));

/**
 * Numeric text field that does not fight the user while typing.
 *
 * A plain `<input type="number" value={n}>` re-renders from the parsed number on every keystroke, so
 * clearing the field snaps back to the old value and "0." collapses to "0" — making values like
 * 0.01 impossible to type. Here the raw text is kept while focused and min/max are applied on blur.
 * Also accepts a comma as decimal separator ("0,01").
 */
export function NumberInput({ value, onValueChange, min, max, integer, onFocus, onBlur, onKeyDown, ...rest }: NumberInputProps) {
    const [draft, setDraft] = useState<string | null>(null);
    const cancelRef = useRef(false);
    const valueAtFocusRef = useRef<number | null>(null);
    const display = draft ?? (value === undefined || value === null || Number.isNaN(value) ? '' : String(value));

    const commit = (text: string) => {
        let n = toNumber(text);
        if (!Number.isFinite(n)) return false;
        if (integer) n = Math.round(n);
        if (min !== undefined && n < min) n = min;
        if (max !== undefined && n > max) n = max;
        onValueChange(n);
        return true;
    };

    return (
        <input
            {...rest}
            type="text"
            inputMode={integer ? 'numeric' : 'decimal'}
            value={display}
            onFocus={(e) => {
                setDraft(display);
                const n = toNumber(display);
                valueAtFocusRef.current = Number.isFinite(n) ? n : null;
                onFocus?.(e);
            }}
            onChange={(e) => {
                const text = e.target.value.trim();
                if (!PARTIAL_NUMBER.test(text)) return;
                setDraft(text);
                const n = toNumber(text);
                // Commit as the user types, but leave range clamping for blur so intermediate
                // values (e.g. "0" on the way to "0.01" when min is 0.01) aren't overwritten
                if (Number.isFinite(n)) onValueChange(integer ? Math.round(n) : n);
            }}
            onBlur={(e) => {
                // Empty / incomplete input reverts to the last valid value
                if (draft !== null && !cancelRef.current) commit(draft);
                cancelRef.current = false;
                setDraft(null);
                onBlur?.(e);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                    cancelRef.current = true;
                    // Undo the values already committed while typing
                    if (valueAtFocusRef.current !== null) onValueChange(valueAtFocusRef.current);
                    (e.target as HTMLInputElement).blur();
                }
                onKeyDown?.(e);
            }}
        />
    );
}
