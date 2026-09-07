// 長押しで開く編集・削除メニューが、必ず操作できる位置に出ること。
//
// 以前このメニューは position:absolute で行の中央に浮いていた。行の高さは
// 40px 固定なのに、メニューは折り返すと最大95pxになるため上下にはみ出し、
// 2つの形で押せなくなっていた:
//
//   - はみ出した部分の当たり判定を隣の行に取られる。行はどれも
//     position:relative で z-index を持たないため、DOM順で後の行が
//     メニューの上に描かれる
//   - 一覧の先頭・末尾の行では .action-history の overflow:hidden に切られる
//
// 実測(375px・シンプルモードの履歴ポップアップ。一覧の幅は2カラムのため117px):
// いちばん新しい記録を長押しすると「編集」「削除」が一覧の上端より上に出て消え、
// その座標の elementFromPoint が背後の .history-popup-team を返した
// —— 直したい記録ほど直せない状態だった。
//
// 直し方は「浮かせるのをやめて行の中へ流し込み、行を伸ばす」。
// はみ出す先が無くなるので、切られも被られもしない。
// jsdomはレイアウトを持たないので、位置そのものは検証できない。
// CSSの記述（浮かせていないこと）と、枠が低いときに見える位置へ寄せる
// 振る舞いの2つを固定する。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActionHistory } from './ActionHistory';
import type { ScoreEntry, Player } from '../../types/game';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

// コメント内にも position: や display: の文字列が出てくるため、先に取り除く
// （foulGroupWidth.test.ts と同じ方針）
const css = readFileSync(
    resolve(process.cwd(), 'src/components/ActionHistory/ActionHistory.css'),
    'utf-8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string {
    const index = css.indexOf(selector);
    if (index === -1) return '';
    const start = css.indexOf('{', index);
    const end = css.indexOf('}', start);
    return css.slice(start + 1, end);
}

const players: Player[] = [createPlayer('a1', 4, '選手A1')];

const scores: ScoreEntry[] = [0, 1, 2].map(i => ({
    id: `s${i}`, teamId: 'teamA', playerId: 'a1', playerNumber: 4,
    scoreType: '2P' as const, points: 2, quarter: 1, timestamp: 1000 + i,
    runningScoreA: 2 * (i + 1), runningScoreB: 0,
}));

const noop = () => { };

function renderHistory() {
    return render(
        <ActionHistory
            teamId="teamA"
            teamName="ホーム"
            scoreHistory={scores}
            statHistory={[]}
            foulHistory={[]}
            players={players}
            onRemoveScore={noop}
            onRemoveStat={noop}
            onRemoveFoul={noop}
            onEditScore={noop}
        />
    );
}

/** 行はEnterでもメニューを開く（長押しと同じ分岐） */
function openMenuAt(index: number) {
    const rows = document.querySelectorAll<HTMLButtonElement>('.history-item-main');
    fireEvent.keyDown(rows[index], { key: 'Enter' });
}

describe('ActionHistory: メニューの置き方', () => {
    it('メニューは行の中に流し込む（浮かせない）', () => {
        const body = ruleBody('.action-history .action-menu');
        expect(body).not.toBe('');
        // position:absolute に戻すと、行の高さ(40px)からはみ出した分が
        // 隣の行に隠れる・枠に切られるという元の症状が戻る
        expect(/position:\s*absolute/.test(body)).toBe(false);
        // 行の2行目を丸ごう使うことで、ボタンが折り返しても行が伸びる
        expect(/flex-basis:\s*100%/.test(body)).toBe(true);
    });

    it('行の高さは固定しない（メニューのぶん伸ばせる）', () => {
        const body = ruleBody('.action-history .history-item');
        expect(body).not.toBe('');
        // height:40px に戻すと、伸びる先が無くなってメニューがはみ出す
        expect(/(^|[;\s])height:\s*40px/.test(body)).toBe(false);
        expect(/min-height:\s*40px/.test(body)).toBe(true);
        expect(/flex-wrap:\s*wrap/.test(body)).toBe(true);
    });

    it('行が伸びても長押しの的は1行ぶんを保つ', () => {
        const body = ruleBody('.action-history .history-item-main');
        expect(body).not.toBe('');
        // height:100% だと、伸びた行の中で親の高さが不定になり
        // 内容の高さまで縮んで的が半分になる
        expect(/(^|[;\s])height:\s*100%/.test(body)).toBe(false);
        expect(/min-height:\s*40px/.test(body)).toBe(true);
    });

    // フルモードのチームパネルでは一覧の見える高さが行より低いことがある
    // （実測 1024×768 で67px。メニューを開いた行は94px）。
    // そのままだと伸びた先が枠外に落ちるので、開いた瞬間に寄せる。
    it('メニューを開いたら見える位置へ寄せる', () => {
        const scrollIntoView = vi.fn();
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = scrollIntoView;
        try {
            renderHistory();
            openMenuAt(0);

            expect(screen.getByRole('button', { name: '削除' })).toBeTruthy();
            expect(scrollIntoView).toHaveBeenCalled();
            // 行ではなくメニューを寄せる。行のほうが枠より高いと、行基準では
            // 上端が揃ってメニューは枠外のままになる
            expect(scrollIntoView.mock.instances[0]).toBe(document.querySelector('.action-menu'));
            // 既に全部見えているときに動かさないための block:'nearest'
            expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
        } finally {
            Element.prototype.scrollIntoView = original;
        }
    });

    it('閉じたときには寄せ直さない', () => {
        const scrollIntoView = vi.fn();
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = scrollIntoView;
        try {
            renderHistory();
            openMenuAt(0);
            scrollIntoView.mockClear();
            fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

            expect(document.querySelector('.action-menu')).toBeNull();
            expect(scrollIntoView).not.toHaveBeenCalled();
        } finally {
            Element.prototype.scrollIntoView = original;
        }
    });
});
