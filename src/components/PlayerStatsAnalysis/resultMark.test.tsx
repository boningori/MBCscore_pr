// 「試合別詳細」の各行が示す勝敗が、色だけに頼っていないこと。
//
// 印は 8x8px の空の <span> で、勝=緑・負=赤・分=黄 の塗り分けだけだった。
// 緑と赤はいちばん多い色覚特性で見分けにくい組み合わせで、しかも空要素なので
// 読み上げには何も出ない。同じ行にスコア（24-36）はあるが、どちらが自分の
// チームかを知っていないと勝敗には直せない。
//
// 色に形を足し、読み上げ名も付ける（role="img" + aria-label は
// TeamComparison の「少ない方が良い」と同じ作法）。
// 試合履歴の一覧が勝った側に★を付けているのと同じで、形が付けば一目で分かる。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DetailView } from './DetailView';
import { makeAggregatedPlayer, makeGameRecord } from '../../test/statsFactories';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

/** 勝ち・負け・引分を1試合ずつ持つ選手 */
function player() {
    return makeAggregatedPlayer({
        name: '山田太郎',
        gamesPlayed: 3,
        gameHistory: [
            makeGameRecord({ gameId: 'g1', date: '2026-08-01T00:00:00.000Z', result: 'win', teamScore: 30, opponentScore: 20 }),
            makeGameRecord({ gameId: 'g2', date: '2026-07-01T00:00:00.000Z', result: 'loss', teamScore: 18, opponentScore: 24 }),
            makeGameRecord({ gameId: 'g3', date: '2026-06-01T00:00:00.000Z', result: 'draw', teamScore: 22, opponentScore: 22 }),
        ],
    });
}

afterEach(cleanup);

describe('試合別詳細の勝敗の印', () => {
    it('勝ち・負け・引分がそれぞれ読み上げ名を持つ', () => {
        render(<DetailView player={player()} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);

        expect(screen.getByRole('img', { name: '勝ち' })).toBeTruthy();
        expect(screen.getByRole('img', { name: '負け' })).toBeTruthy();
        expect(screen.getByRole('img', { name: '引分' })).toBeTruthy();
    });
});

// jsdomはレイアウトを計算しないのでCSSの記述を直接見る
// （src/components/ActionButtons/foulGroupWidth.test.ts と同じ方針）
const css = readFileSync(
    resolve(process.cwd(), 'src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string {
    const index = css.indexOf(selector);
    if (index === -1) return '';
    const start = css.indexOf('{', index);
    const end = css.indexOf('}', start);
    return css.slice(start + 1, end);
}

describe('勝敗の印の形', () => {
    it('負けは中空にして、塗りつぶしの勝ちと形で分ける', () => {
        const body = ruleBody('.player-stats-container .result-dot.loss');

        expect(/background:\s*transparent\s*;/.test(body)).toBe(true);
        expect(/border:/.test(body)).toBe(true);
    });

    it('引分は円をやめて横棒にする（勝ちとも負けとも形が違う）', () => {
        const body = ruleBody('.player-stats-container .result-dot.draw');

        expect(/border-radius:\s*0/.test(body)).toBe(true);
        expect(/height:/.test(body)).toBe(true);
    });
});
