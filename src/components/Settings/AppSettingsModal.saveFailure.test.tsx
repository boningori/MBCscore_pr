// 保存できていないのに「設定を保存しました」と言わない。
//
// APIキーの保存だけが createStorage を通らない生の localStorage 書き込みで、
// 容量超過やプライベートブラウズで setItem が投げると例外が onClick を抜けて
// いた。続けて書くはずの既定ゲームモードは書かれず、成功の通知も失敗の通知も
// 出ない——押しても何も起きない保存ボタンになる。
//
// 他の保存領域と同じで、書けなかったことは必ず伝える。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AppSettingsModal } from './AppSettingsModal';
import { showToast } from '../Toast/toastApi';
import { loadAppSettings } from '../../utils/appSettings';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
beforeEach(() => {
    localStorage.clear();
    vi.mocked(showToast).mockClear();
});

/** APIキーの入力欄だけが setItem で失敗する状況を作る */
function failWritesTo(key: string) {
    const original = Storage.prototype.setItem;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
        if (k === key) throw new DOMException('quota', 'QuotaExceededError');
        original.call(this, k, v);
    });
}

/** セクションは1つずつしか開かないので、開いてから操作する */
function typeApiKey(value: string) {
    fireEvent.click(screen.getByRole('button', { name: /AI機能/ }));
    const input = document.querySelector('input[type="password"], input.api-key-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
}

function selectSimpleMode() {
    fireEvent.click(screen.getByRole('button', { name: /デフォルトゲームモード/ }));
    fireEvent.click(screen.getByRole('button', { name: /シンプルモード/ }));
}

describe('設定の保存に失敗したとき', () => {
    it('「保存しました」ではなく、保存できなかったことを伝える', () => {
        failWritesTo('mbc_gemini_api_key');
        render(<AppSettingsModal isOpen onClose={vi.fn()} />);
        typeApiKey('abc123');

        fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));

        const messages = vi.mocked(showToast).mock.calls.map(c => String(c[0]));
        expect(messages.some(m => m.includes('保存しました'))).toBe(false);
        expect(messages.some(m => m.includes('保存できませんでした'))).toBe(true);
    });

    // 例外で中断していたため、APIキーが書けないだけで既定モードまで
    // 道連れになっていた。独立した設定なので、書けるほうは書く
    it('APIキーが書けなくても、既定ゲームモードの保存は続ける', () => {
        failWritesTo('mbc_gemini_api_key');
        render(<AppSettingsModal isOpen onClose={vi.fn()} />);
        typeApiKey('abc123');
        selectSimpleMode();

        fireEvent.click(screen.getByRole('button', { name: '設定を保存' }));

        expect(loadAppSettings().defaultGameMode).toBe('simple');
    });
});
