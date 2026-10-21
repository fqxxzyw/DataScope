import { useEffect } from 'react';
import type { Label } from './types';
export function useShortcuts({
  enabled,
  labels,
  label,
  previous,
  next,
  skip,
  undo,
  expand,
  confirm,
}: {
  enabled: boolean;
  labels: Label[];
  label: (id: string) => void;
  previous: () => void;
  next: () => void;
  skip: () => void;
  undo: () => void;
  expand: () => void;
  confirm: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        !enabled ||
        e.repeat ||
        e.isComposing ||
        el.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
        el.closest('dialog[open]')
      )
        return;
      if (el.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const l = labels.find((l) => l.shortcut === e.key && l.shortcut);
      if (l) {
        e.preventDefault();
        label(l.id);
        return;
      }
      const action =
        e.key === 'ArrowLeft' || e.key === 'Backspace'
          ? previous
          : e.key === 'ArrowRight'
            ? next
            : e.key === ' '
              ? skip
              : e.key === 'Enter'
                ? confirm
                : e.key.toLowerCase() === 'f'
                  ? expand
                  : null;
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, labels, label, previous, next, skip, undo, expand, confirm]);
}
