import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsSection } from './SettingsSection';

afterEach(cleanup);

describe('SettingsSection', () => {
    it('閉じているときは中身を出さない', () => {
        render(
            <SettingsSection id="x" title="データ管理" isOpen={false} onToggle={() => { }}>
                <p>中身</p>
            </SettingsSection>,
        );
        expect(screen.queryByText('中身')).toBeNull();
    });

    it('開いているときは中身を出す', () => {
        render(
            <SettingsSection id="x" title="データ管理" isOpen onToggle={() => { }}>
                <p>中身</p>
            </SettingsSection>,
        );
        expect(screen.getByText('中身')).toBeTruthy();
    });

    it('見出しは開閉状態を支援技術に伝える', () => {
        const { rerender } = render(
            <SettingsSection id="x" title="データ管理" isOpen={false} onToggle={() => { }}>
                <p>中身</p>
            </SettingsSection>,
        );
        const header = screen.getByRole('button', { name: /データ管理/ });
        expect(header.getAttribute('aria-expanded')).toBe('false');

        rerender(
            <SettingsSection id="x" title="データ管理" isOpen onToggle={() => { }}>
                <p>中身</p>
            </SettingsSection>,
        );
        expect(header.getAttribute('aria-expanded')).toBe('true');
    });

    it('見出しをクリックするとonToggleが呼ばれる', () => {
        const onToggle = vi.fn();
        render(
            <SettingsSection id="x" title="データ管理" isOpen={false} onToggle={onToggle}>
                <p>中身</p>
            </SettingsSection>,
        );
        fireEvent.click(screen.getByRole('button', { name: /データ管理/ }));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('見出しは中身を aria-controls で指す', () => {
        render(
            <SettingsSection id="data" title="データ管理" isOpen onToggle={() => { }}>
                <p>中身</p>
            </SettingsSection>,
        );
        const header = screen.getByRole('button', { name: /データ管理/ });
        const panelId = header.getAttribute('aria-controls');
        expect(panelId).toBeTruthy();
        expect(document.getElementById(panelId!)).toBeTruthy();
    });
});
