// 一覧から統合するまでの流れ。
//
// 割れたカードは利用者が直せなければ意味がないので、
// 「気づく（候補の案内）」「選ぶ（選択モード）」「確かめる（確認）」まで通す。
//
// カードの特定に getByRole の name は使えない。testing-library の既定の
// ノーマライザは \s+ を半角スペースへ畳み、全角スペース(U+3000)も \s に
// 含まれる。つまり「佐藤(全角スペース)太郎」と「佐藤 太郎」はアクセシブル名として同じに
// なり、多重一致で落ちる（この機能がまさに救おうとしている表記ゆれ）。位置で引く。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlayerStatsAnalysis } from './PlayerStatsAnalysis';
import { loadMergedPlayers } from '../../utils/mergedPlayers';
import { saveGameResult } from '../../utils/gameHistoryStorage';
import { createTeam, createPlayer } from '../../types/game';

const TEAM_ID = 't1';

function seedTeam() {
    localStorage.setItem('minibasket-my-teams', JSON.stringify([{
        id: TEAM_ID, name: 'チーム', coachName: 'C', assistantCoachName: '',
        players: [{ number: 4, uniformNumber: 4, name: '佐藤 太郎', isCaptain: false }],
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }]));
}

function recordGame(name: string, number: number, points: number, date: string) {
    const p = createPlayer('p', number, name);
    p.stats = { ...p.stats, points };
    p.quartersPlayed = ['starter', false, false, false];
    const mine = createTeam('teamA', 'チーム', 'C');
    mine.isMyTeam = true;
    mine.savedTeamId = TEAM_ID;
    mine.players = [p];
    const other = createTeam('teamB', '相手', 'C');
    other.players = [createPlayer('b', 9, '相手')];
    saveGameResult('試合', mine, other, [], [], [], new Date(date));
}

/** 割れている状態を作る。背番号を分けるのはテストからカードを見分けるため */
function seedSplitPlayer() {
    recordGame('佐藤　太郎', 7, 10, '2026-04-01'); // 全角スペース
    recordGame('佐藤 太郎', 4, 8, '2026-06-01');
}

const cards = () => [...document.querySelectorAll<HTMLButtonElement>('.player-card')];
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
    localStorage.clear();
    seedTeam();
});
afterEach(cleanup);

describe('統合の流れ', () => {
    it('割れているカードがあると候補の案内が出る', () => {
        seedSplitPlayer();

        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(screen.getByText(/同じ選手が分かれているかもしれません/)).toBeTruthy();
    });

    it('割れていなければ候補の案内は出ない', () => {
        recordGame('佐藤 太郎', 4, 8, '2026-06-01');

        render(<PlayerStatsAnalysis onBack={() => { }} />);

        expect(screen.queryByText(/同じ選手が分かれているかもしれません/)).toBeNull();
    });

    it('選択モードで2枚選んで統合すると1枚になる', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);
        expect(cards()).toHaveLength(2);

        fireEvent.click(button('選手を統合'));
        cards().forEach(card => fireEvent.click(card));
        fireEvent.click(button('統合する'));
        fireEvent.click(button('この内容で統合'));

        // 名簿に載っている「佐藤 太郎」が代表になる
        expect(loadMergedPlayers(TEAM_ID)).toEqual({ '佐藤　太郎': '佐藤 太郎' });
        expect(cards()).toHaveLength(1);
        expect(screen.getAllByText('統合済み')).toHaveLength(1);
    });

    it('1枚しか選んでいないと統合へ進めない', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('選手を統合'));
        fireEvent.click(cards()[0]);

        expect((button('統合する') as HTMLButtonElement).disabled).toBe(true);
    });

    it('確認に代表の氏名と合算後の試合数が出る', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('選手を統合'));
        cards().forEach(card => fireEvent.click(card));
        fireEvent.click(button('統合する'));

        expect(screen.getByText(/#4 佐藤 太郎/)).toBeTruthy();
        expect(screen.getByText(/合計2試合/)).toBeTruthy();
    });

    // 統合すると2枚が1枚になる。1枚では相手が居ないので入口のボタンも消えるのが正しい。
    // 選択モードを抜けたことは、選択モード中だけ出る操作子が消えたことで確かめる
    it('統合したら選択モードを抜ける', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('選手を統合'));
        cards().forEach(card => fireEvent.click(card));
        fireEvent.click(button('統合する'));
        fireEvent.click(button('この内容で統合'));

        expect(screen.queryByRole('button', { name: '統合する' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'やめる' })).toBeNull();
        expect(cards()).toHaveLength(1);
    });

    it('「確認する」を押すと候補の組が選ばれた状態になる', () => {
        seedSplitPlayer();
        render(<PlayerStatsAnalysis onBack={() => { }} />);

        fireEvent.click(button('確認する'));

        expect(cards().every(c => c.getAttribute('aria-pressed') === 'true')).toBe(true);
        expect((button('統合する') as HTMLButtonElement).disabled).toBe(false);
    });
});
