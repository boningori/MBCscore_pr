// 設定: AI写真読込（Gemini）のON/OFFと同意。
//
// これまでAI経路は「APIキーがあるかどうか」だけで決まっていた。キーは音声メモと
// 共用なので、音声メモのためにキーを入れた利用者は、名簿の撮影画像——子どもの
// 氏名とJBA登録番号が写ったもの——まで黙ってGoogleへ送る状態になっていた。
// 音声メモ側は設定ON＋初回の同意を要求しているのに、より機微の高い画像のほうが
// 素通しだったので、同じ形にそろえる。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppSettingsModal } from './AppSettingsModal';
import { saveApiKey } from '../../utils/geminiClient';
import { hasAiOcrConsent, isAiOcrEnabled, isVoiceMemoEnabled } from '../../utils/appSettings';

afterEach(cleanup);

beforeEach(() => {
    localStorage.clear();
    saveApiKey('test-key');
});

const toggle = () => screen.getByRole('checkbox', { name: /写真をAIで読み取る/ }) as HTMLInputElement;

const openAiSection = () => {
    render(<AppSettingsModal isOpen onClose={() => { }} />);
    fireEvent.click(screen.getByRole('button', { name: /AI機能/ }));
};

const CONSENT_TEXT = /名簿の写真をGoogleのサーバーへ送信します/;

describe('設定: AI写真読込', () => {
    it('APIキーがあっても、既定ではOFFになっている', () => {
        openAiSection();
        expect(toggle().checked).toBe(false);
    });

    it('初回ONで外部送信の確認が出る（この時点ではまだ有効化しない）', () => {
        openAiSection();
        fireEvent.click(toggle());
        expect(screen.getByText(CONSENT_TEXT)).toBeTruthy();
        expect(isAiOcrEnabled()).toBe(false);
    });

    it('確認に同意すると有効になる', () => {
        openAiSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /同意して有効にする/ }));
        expect(isAiOcrEnabled()).toBe(true);
        expect(hasAiOcrConsent()).toBe(true);
    });

    it('確認をキャンセルするとOFFのまま', () => {
        openAiSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /有効にしない/ }));
        expect(isAiOcrEnabled()).toBe(false);
        expect(hasAiOcrConsent()).toBe(false);
    });

    it('同意済みなら2回目のONで確認は出ない', () => {
        openAiSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /同意して有効にする/ }));
        fireEvent.click(toggle()); // OFF
        fireEvent.click(toggle()); // 再ON
        expect(screen.queryByText(CONSENT_TEXT)).toBeNull();
        expect(isAiOcrEnabled()).toBe(true);
    });

    it('OFFに戻せる', () => {
        openAiSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /同意して有効にする/ }));
        fireEvent.click(toggle());
        expect(isAiOcrEnabled()).toBe(false);
    });

    // ここがこの変更の主眼。キー1つで両方が有効になる状態を無くす
    it('AI写真読込をONにしても、音声メモは有効にならない', () => {
        openAiSection();
        fireEvent.click(toggle());
        fireEvent.click(screen.getByRole('button', { name: /同意して有効にする/ }));
        expect(isVoiceMemoEnabled()).toBe(false);
    });
});
