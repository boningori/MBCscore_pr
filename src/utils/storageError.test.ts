import { describe, it, expect, vi } from 'vitest';
import { STORAGE_ERROR_EVENT, notifyStorageError } from './storageError';

describe('storageError', () => {
    it('notifyStorageErrorでカスタムイベントが発火し、contextが渡る', () => {
        const handler = vi.fn();
        window.addEventListener(STORAGE_ERROR_EVENT, handler);
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        notifyStorageError('game session', new Error('quota exceeded'));

        expect(handler).toHaveBeenCalledTimes(1);
        const event = handler.mock.calls[0][0] as CustomEvent;
        expect(event.detail.context).toBe('game session');
        expect(spy).toHaveBeenCalled();

        window.removeEventListener(STORAGE_ERROR_EVENT, handler);
        spy.mockRestore();
    });
});
