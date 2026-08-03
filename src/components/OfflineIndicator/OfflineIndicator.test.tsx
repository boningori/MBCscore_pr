import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { OfflineIndicator } from './OfflineIndicator';

afterEach(() => {
    cleanup();
    setOnline(true);
});

function setOnline(online: boolean) {
    Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
    act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')); });
}

describe('OfflineIndicator', () => {
    it('オンラインの間は何も出さない', () => {
        setOnline(true);
        const { container } = render(<OfflineIndicator />);
        expect(container.firstChild).toBeNull();
    });

    it('オフラインになったら表示する', () => {
        render(<OfflineIndicator />);
        setOnline(false);
        expect(screen.getByRole('status')).toBeTruthy();
    });

    it('記録を続けられることを伝える（不安にさせない）', () => {
        render(<OfflineIndicator />);
        setOnline(false);
        // 全機能オフラインで動くので、警告ではなく安心材料として出す
        expect(screen.getByRole('status').textContent).toContain('記録は続けられます');
    });

    it('復帰したら消える', () => {
        render(<OfflineIndicator />);
        setOnline(false);
        expect(screen.queryByRole('status')).toBeTruthy();
        setOnline(true);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('オフライン状態で開始した場合も表示する', () => {
        setOnline(false);
        render(<OfflineIndicator />);
        expect(screen.getByRole('status')).toBeTruthy();
    });
});
