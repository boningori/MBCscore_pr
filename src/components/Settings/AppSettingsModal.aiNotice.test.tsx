// AI機能の説明が「何が外部へ出るのか」を曖昧にしていた。
//
// 「APIキーはこのデバイス内にのみ保存されます。OCR実行時にGoogleのAPIへ
// 送信されますが…」は2文目の主語がAPIキーに読める。実際に送信されるのは
// 名簿の撮影画像で、子どもの氏名とライセンスNo.が写る。
// プライバシーポリシー（LegalModal）は「撮影画像のみ」と正しく書けているので、
// 設定画面の文言をそちらに揃える。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { AppSettingsModal } from './AppSettingsModal';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

function openAiSection() {
    render(<AppSettingsModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /AI機能/ }));
    return document.querySelector('.security-notice') as HTMLElement;
}

describe('AI機能の説明', () => {
    it('送信されるのが撮影画像であることを書く', () => {
        const notice = openAiSection();

        expect(within(notice).getByText(/撮影(した)?画像/)).toBeTruthy();
    });

    it('画像に氏名などが写ることに触れる', () => {
        const notice = openAiSection();

        expect(notice.textContent).toMatch(/氏名/);
    });

    it('APIキー自体は端末内に留まることも引き続き書く', () => {
        const notice = openAiSection();

        expect(notice.textContent).toMatch(/APIキー/);
        expect(notice.textContent).toMatch(/デバイス内|端末内/);
    });

    it('オフラインOCRなら送信されないことを書く', () => {
        const notice = openAiSection();

        expect(notice.textContent).toMatch(/標準|オフライン/);
    });
});
