// 「試合別詳細」の列見出しと数字が、スマホ幅で別々の場所に折り返される問題。
//
// 幅600px以下では6列グリッドをやめて flex-wrap の2行に分ける
// （PlayerStatsAnalysis.css の「試合別詳細テーブル: スマホ幅では2行に折り返す」）。
// この切り替えを書いたあとに F（ファウル）列が増えたが、折り返しの計算に
// 入っていなかった。flex-wrap は各アイテムの基準サイズを順に詰めて改行位置を
// 決めるため、1行目の合計幅——対戦相手名の文字数・スコアの桁・ファウル数の桁で
// 数px単位で変わる——が閾値をまたぐかどうかで、行ごとに改行位置が変わる。
//
// 実測（本番ビルド・375x812・同じ表の中）:
//   見出し           PTS〜BLK: x40-185（2行目左半分） / TO〜CM: x191-335（2行目右半分）
//   「西浜」の行     PTS〜BLK: x192-335（1行目右半分） / TO〜CM: x43-335（2行目全幅）
//   他6行            PTS〜BLK: x43-186              / TO〜CM: x192-335
// つまり「西浜」の行だけ、PTS の見出しの真下にターンオーバー数が並び、
// 実際の得点は TO の見出しの下に来る。数字を縦に追う表なので読み違える。
//
// jsdom はレイアウトを計算しないので実寸では検証できない。代わりに、
// 内容に左右されない改行位置を作る仕掛け——見出しと各行の同じ位置に置いた
// 明示的な改行要素——が揃っていることを見る（CSS側は下の describe）。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DetailView } from './DetailView';
import { makeAggregatedPlayer, makeGameRecord, makeStats } from '../../test/statsFactories';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));
vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

/** 折り返し位置が動く条件をそろえた3試合（対戦相手名の長さ・スコアの桁・ファウル数を変える） */
function player() {
    const games = [
        { gameId: 'g1', opponent: '西浜', teamScore: 24, opponentScore: 36, fouls: 1 },
        { gameId: 'g2', opponent: 'みどりヶ丘', teamScore: 9, opponentScore: 8, fouls: 0 },
        { gameId: 'g3', opponent: '北新田', teamScore: 100, opponentScore: 98, fouls: 5 },
    ];
    return makeAggregatedPlayer({
        name: '山田太郎',
        gamesPlayed: games.length,
        gameHistory: games.map((g, i) => makeGameRecord({
            ...g,
            date: `2026-0${i + 6}-01T00:00:00.000Z`,
            stats: makeStats({ points: 4, turnovers: 1 }),
        })),
    });
}

/** 要素の何番目の子が改行要素か（無ければ -1） */
function breakIndex(el: Element): number {
    return [...el.children].findIndex(child => child.classList.contains('game-row-break'));
}

afterEach(cleanup);

describe('試合別詳細の列の折り返し', () => {
    it('見出しと各行が、同じ位置に明示的な改行を持つ', () => {
        render(<DetailView player={player()} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);

        const header = document.querySelector('.game-history-header')!;
        const rows = [...document.querySelectorAll('.game-row')];

        expect(rows).toHaveLength(3);
        expect(breakIndex(header)).toBeGreaterThanOrEqual(0);
        for (const row of rows) {
            expect(breakIndex(row)).toBe(breakIndex(header));
        }
    });

    it('改行はファウル欄の直後・スタッツ欄の直前に入る（1行目と2行目の境目）', () => {
        render(<DetailView player={player()} teamId="t" isHidden={false} onToggleHidden={vi.fn()} />);

        for (const el of [document.querySelector('.game-history-header')!, ...document.querySelectorAll('.game-row')]) {
            const children = [...el.children];
            const index = breakIndex(el);
            expect(children[index - 1]!.className).toMatch(/foul/);
            expect(children[index + 1]!.className).toMatch(/stats/);
        }
    });
});

// CSSの記述を直接見る（jsdomはレイアウトを計算しない。
// src/components/ActionButtons/foulGroupWidth.test.ts と同じ方針）。
// コメント内にも同じ語が出るため、先に取り除いてから解析する
const css = readFileSync(
    resolve(process.cwd(), 'src/components/PlayerStatsAnalysis/PlayerStatsAnalysis.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** セレクタに対応する宣言ブロックの中身を返す（先頭一致の1つ目） */
function ruleBody(selector: string, from = 0): string {
    const index = css.indexOf(selector, from);
    if (index === -1) return '';
    const start = css.indexOf('{', index);
    const end = css.indexOf('}', start);
    return css.slice(start + 1, end);
}

const BREAK_SELECTOR = '.player-stats-container .game-row-break';

describe('試合別詳細の改行要素のCSS', () => {
    it('広い画面では在って無いものにする（6列グリッドの列数を狂わせない）', () => {
        expect(/display:\s*none\s*;/.test(ruleBody(BREAK_SELECTOR))).toBe(true);
    });

    it('スマホ幅では必ず1行を占め、続きを次の行へ送る', () => {
        // 2つ目の定義がスマホ幅（max-width: 600px）側
        const mobileIndex = css.indexOf(BREAK_SELECTOR, css.indexOf(BREAK_SELECTOR) + 1);
        expect(mobileIndex).toBeGreaterThan(-1);

        const body = ruleBody(BREAK_SELECTOR, mobileIndex);
        // 基準サイズ100%なら、1行目に何が入っていても必ず次の行へ落ちる。
        // ここが auto や content だと従来の「内容次第で改行位置が変わる」状態に戻る
        expect(/flex(?:-basis)?:[^;]*100%/.test(body)).toBe(true);
    });
});
