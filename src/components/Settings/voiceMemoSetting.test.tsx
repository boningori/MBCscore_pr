import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppSettingsModal } from './AppSettingsModal';
import { saveApiKey } from '../../utils/geminiClient';
import { hasVoiceMemoConsent, isVoiceMemoEnabled } from '../../utils/appSettings';

afterEach(cleanup);

beforeEach(() => {
    localStorage.clear();
    saveApiKey('test-key');
});

// jest-dom は導入していないため、checked は素のプロパティで確かめる
const toggle = () => screen.getByRole('checkbox', { name: /音声メモを使う/ }) as HTMLInputElement;

const openVoiceMemoSection = () => {
    render(<AppSettingsModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /音声メモ/ }));
};

describe('設定: 音声メモ', () => {
    it('既定ではOFFになっている', () => {
        openVoiceMemoSection();
        expect(toggle().checked).toBe(false);
    });

    it('初回ONで外部送信の確認が出る（この時点ではまだ有効化しない）', () => {
        openVoiceMemoSection();
        fireEvent.click(toggle());
        expect(screen.getByText(/Googleのサーバーに送信されます/)).toBeTruthy();
        expect(isVoiceMemoEnabled()).toBe(false);
    });

    it('確認に同意すると有効になる', () => {
        openVoiceMemoSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /同意して有効にする/ }));
        expect(isVoiceMemoEnabled()).toBe(true);
        expect(hasVoiceMemoConsent()).toBe(true);
    });

    it('確認をキャンセルするとOFFのまま', () => {
        openVoiceMemoSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /有効にしない/ }));
        expect(isVoiceMemoEnabled()).toBe(false);
        expect(hasVoiceMemoConsent()).toBe(false);
    });

    it('同意済みなら2回目のONで確認は出ない', () => {
        openVoiceMemoSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /同意して有効にする/ }));
        fireEvent.click(toggle()); // OFF
        fireEvent.click(toggle()); // 再ON
        expect(screen.queryByText(/Googleのサーバーに送信されます/)).toBeNull();
        expect(isVoiceMemoEnabled()).toBe(true);
    });

    it('APIキーが無いときは必要である旨を案内する', () => {
        saveApiKey('');
        openVoiceMemoSection();
        expect(screen.getByText(/APIキーの設定が必要/)).toBeTruthy();
    });
});
