import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LegalModal } from './LegalModal';

afterEach(cleanup);

// LegalModal は isOpen が必須で、プライバシーポリシーは 'privacy' タブ配下にある
const openPrivacy = () => render(<LegalModal isOpen initialTab="privacy" onClose={() => {}} />);

describe('プライバシーポリシー: 外部への送信', () => {
    it('外部への送信の節がある', () => {
        openPrivacy();
        expect(screen.getByText(/外部への送信/)).toBeTruthy();
    });

    it('音声メモで吹き込んだ音声が送信対象として書かれている', () => {
        openPrivacy();
        expect(document.body.textContent).toContain('音声メモ');
    });

    it('送信は利用者自身のAPIキーを設定した場合に限ると明記している', () => {
        openPrivacy();
        expect(document.body.textContent).toContain('APIキー');
    });

    it('メモが試合終了で破棄されバックアップに含まれないことを明記している', () => {
        openPrivacy();
        expect(document.body.textContent).toContain('バックアップ');
    });
});
