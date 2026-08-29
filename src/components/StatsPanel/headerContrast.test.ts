// --text-muted を「カード地(--bg-tertiary)より明るい面では使わない」運用を、
// 実際にその地を持つ面のCSSで守れているか確かめる。
//
// index.contrast.test.ts はトークン同士の組み合わせを縛るが、「どのトークンを
// どの面で使ったか」までは見ない。実測で、地が --bg-tertiary の面に
// --text-muted を載せている箇所が3つあった:
//   チーム統計の見出し行           3.41:1
//   チーム統計のTO内訳見出し        2.74:1（opacity 0.8 込み）
//   マイチーム編集のライセンスNo.   3.41:1
// いずれもAA(4.5:1)に届かない。--text-secondary は3面すべてで保証されている
// （index.contrast.test.ts）ので、そちらを使う。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom環境では import.meta.url が file: にならないため cwd 基準で読む
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8');

/**
 * セレクタのブロック本文を取り出す（見つからなければ失敗させる）。
 *
 * コメントは落とす —— なぜその色にしたのかの説明に 'opacity' や
 * 'text-muted' の語が出るため、素のまま照合すると説明文のほうに引っかかる。
 */
function block(css: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matched = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!matched) throw new Error(`${selector} が見つからない`);
    return matched[1].replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('--bg-tertiary の面で --text-muted を使わない', () => {
    it('チーム統計の見出し行', () => {
        const css = read('src/components/StatsPanel/StatsPanel.css');
        const header = block(css, '.stats-panel .stats-header');
        // 地が --bg-tertiary であることも一緒に固定する（地が変われば前提も変わる）
        expect(header).toContain('background: var(--bg-tertiary)');
        expect(header).not.toContain('var(--text-muted)');
        expect(header).toContain('color: var(--text-secondary)');
    });

    it('チーム統計のTO内訳見出し（薄め指定も残さない）', () => {
        const css = read('src/components/StatsPanel/StatsPanel.css');
        const toHeader = block(css, '.stats-panel .stats-header .stats-col-to');

        expect(toHeader).not.toContain('var(--text-muted)');
        expect(toHeader).not.toContain('opacity');
    });

    it('マイチーム編集のライセンスNo.', () => {
        const css = read('src/components/MyTeamManager/MyTeamManager.css');
        const license = block(css, ':is(.my-team-manager, .my-team-editor) .player-license');

        expect(license).not.toContain('var(--text-muted)');
        expect(license).toContain('color: var(--text-secondary)');
    });
});

// スワイプの向きを説明するヒントは、4方向フリック／上下スワイプが何になるかを
// 伝える唯一の表示。読めなければ機能が存在しないのと同じになる。
// 実測 1.89:1（ターンオーバー）・2.9:1（得点）。薄さで階層を作らない。
describe('スワイプヒントを薄めない', () => {
    it('ターンオーバーの4方向ヒント', () => {
        const css = read('src/components/ActionButtons/SwipeableTurnoverButton.css');

        expect(block(css, '.swipeable-turnover-wrapper .swipe-hints')).not.toContain('opacity');
        expect(block(css, '.swipeable-turnover-wrapper .hint')).toContain('color: var(--text-secondary)');
    });

    it('得点ボタンの上下ヒント', () => {
        const css = read('src/components/ActionButtons/SwipeableScoreButton.css');
        const hint = block(css, '.swipeable-score-wrapper .swipeable-score-btn .action-hint');

        expect(hint).not.toContain('opacity');
        expect(hint).toContain('color: var(--text-secondary)');
    });
});

// 緑・赤を文字に使うときは、枠線・背景用ではなく文字用トークンを使う（index.css）
describe('直近フォームの増減は文字用トークンを使う', () => {
    it('--secondary-light / --danger-light を文字色にしない', () => {
        const css = read('src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css');

        expect(block(css, '.player-stats-container .recent-form-card .rf-delta.up'))
            .toContain('color: var(--secondary-text)');
        expect(block(css, '.player-stats-container .recent-form-card .rf-delta.down'))
            .toContain('color: var(--danger-text)');
    });
});

// ファウル入力フローも同じ穴を持っていた（実測）:
//   長押しの案内 2.44:1 / 「ファウルした選手」3.41:1 / 選択中の ✓ 3.91:1
describe('ファウル入力フローの補助表示', () => {
    it('長押しの案内を薄めない', () => {
        const css = read('src/components/FoulInputFlow/FoulInputFlow.css');
        const hint = block(css, '.foul-input-flow .foul-type-hint');

        expect(hint).not.toContain('opacity');
        expect(hint).toContain('color: var(--text-secondary)');
    });

    it('「ファウルした選手」の見出しに --text-muted を使わない', () => {
        const css = read('src/components/FoulInputFlow/FoulInputFlow.css');

        expect(block(css, '.foul-input-flow .foul-target-label'))
            .toContain('color: var(--text-secondary)');
    });

    // 選択中のカードは色みを敷いた面。枠線・背景用の --*-light では届かない
    it('選択中の ✓ は色み面向けの文字トークンを使う', () => {
        const css = read('src/App.css');

        expect(block(css, '.app-container .mini-player-card .player-check'))
            .toContain('color: var(--active-highlight-text-on-tint)');
    });
});
