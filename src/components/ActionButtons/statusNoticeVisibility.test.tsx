import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActionButtons } from './ActionButtons';

// クォーター間の注意書き（idleNotice）が、シンプルモードでも実際に見えることを固定する。
//
// ステータスバーは3つの状態を持つ:
//   1. 記録待ち（activeAction）      … 常に表示
//   2. 注意書き（idleNotice）        … 常に表示したい ← ここ
//   3. アイドルの案内文               … シンプルモードでは場所を食うだけなので隠す
//
// シンプルモードのCSSは 3 を隠すために `:not(.active)` で指定していたため、
// 2 も巻き添えで display:none になっていた（実測: 要素は存在し文言も正しいのに
// 高さ0）。この注意書きは「いま記録するとQ2として保存される」ことを伝える唯一の
// 手掛かりで、記録のクォーター帰属を後から直す導線は無い。つまり見えないことが
// そのまま誤ったピリオドの記録になる。
//
// 判定に使うクラスをコンポーネントとCSSの両方から確かめる。jsdom は外部CSSを
// 適用しないので、片方だけでは「クラスは付くが隠れたまま」を検知できない。
const NOTICE_CLASS = 'has-notice';

afterEach(cleanup);

const noop = vi.fn();

function renderWith(props: {
    idleNotice?: string | null;
    activeAction?: { type: string; value?: string };
    disabled?: boolean;
}) {
    render(
        <ActionButtons
            onScore={noop}
            onStat={noop}
            onMiss={noop}
            onFoul={noop}
            gameMode="simple"
            {...props}
        />,
    );
    return screen.getByRole('status');
}

describe('ActionButtons: クォーター間の注意書きは隠されない', () => {
    it('idleNoticeがあるとステータスバーに注意書き用のクラスが付く', () => {
        const bar = renderWith({ idleNotice: '⚠ 今の記録は Q2 として保存されます' });
        expect(bar.className).toMatch(new RegExp(`\\b${NOTICE_CLASS}\\b`));
    });

    it('アイドルの案内文だけのときは付かない（シンプルモードでは隠してよい）', () => {
        const bar = renderWith({});
        expect(bar.className).not.toMatch(new RegExp(`\\b${NOTICE_CLASS}\\b`));
    });

    // 試合終了後は入力ボタンも選手カードも止まっている（App が disabled を渡す）。
    // そこで「選手とアクションをタップして記録」と誘い続けると、押しても反応しない
    // 理由が画面のどこにも無い。案内文ではなく注意書きとして出し、シンプルモードでも
    // 隠さない（隠す指定は :not(.has-notice)）
    describe('試合終了後', () => {
        it('アイドルの案内文ではなく、記録できないことを出す', () => {
            const bar = renderWith({ disabled: true });

            expect(bar.textContent).toContain('試合終了');
            expect(screen.queryByText('選手とアクションをタップして記録')).toBeNull();
            expect(bar.className).toMatch(new RegExp(`\\b${NOTICE_CLASS}\\b`));
        });

        it('終了前に立てた記録待ちが残っていても、記録できないことを優先する', () => {
            // 選手カードも止まっているので、この記録待ちはもう解決できない
            const bar = renderWith({ disabled: true, activeAction: { type: 'SCORE', value: '2P' } });

            expect(bar.textContent).toContain('試合終了');
            expect(bar.className).not.toMatch(/\bactive\b/);
        });
    });

    it('記録待ち中は注意書きより記録待ちの表示を優先する', () => {
        const bar = renderWith({
            activeAction: { type: 'SCORE', value: '2P' },
            idleNotice: '⚠ 今の記録は Q2 として保存されます',
        });
        expect(bar.className).toMatch(/\bactive\b/);
        expect(bar.className).not.toMatch(new RegExp(`\\b${NOTICE_CLASS}\\b`));
    });
});

describe('App.css: シンプルモードの非表示指定が注意書きを巻き込まない', () => {
    // jsdom環境では import.meta.url が file: にならないため cwd 基準で読む
    // （appSettings.cssSync.test.ts と同じ）
    const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf-8');

    it('ステータスバーを隠す指定が注意書きのクラスを除外している', () => {
        const hideRules = [...appCss.matchAll(/([^{}]*\.action-status-bar[^{}]*)\{([^}]*)\}/g)]
            .filter(m => /display:\s*none/.test(m[2]))
            .map(m => m[1].replace(/\s+/g, ' ').trim());

        expect(hideRules.length).toBeGreaterThan(0);
        for (const selector of hideRules) {
            expect(selector).toContain(`:not(.${NOTICE_CLASS})`);
        }
    });
});
