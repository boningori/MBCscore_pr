// 選手ごとのフィールドが欠けた試合レコードでも、履歴の試合詳細が開けること。
//
// 実測: 1選手の stats を落としたレコードを開くと
// 「Cannot read properties of undefined (reading 'points')」で落ち、ErrorBoundary に
// よってアプリ全体がエラー画面に置き換わる。データは localStorage に残るので
// リロードしても再発し、しかも原因のレコードが示されないため、利用者には
// 「履歴の一覧までは開けるのに、その試合を開くと必ず落ちる」としか見えない。
//
// 補完は migrateTeam に1つだけ置き、recordToGame（公式様式）とチーム比較の
// 両方がそこを通る。この検査は「新しい読み手が migrateTeam を通し忘れる」ほうを
// 見張るために、画面から開いて確かめる。

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';
import type { GameRecord } from '../../utils/gameHistoryStorage';
import type { Player } from '../../types/game';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

/** stats を持たない選手（手で編集したバックアップ由来） */
const brokenPlayer = {
    id: 'a1', number: 4, name: '一郎', isCaptain: true, isOnCourt: false,
} as unknown as Player;

const brokenRecord: GameRecord = {
    id: 'g1',
    date: new Date(Date.UTC(2026, 5, 5)).toISOString(),
    gameName: '第1節',
    teamA: {
        id: 't-red', name: 'レッドミニバス', color: 'white', coachName: 'C',
        assistantCoachName: '', timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [],
        players: [brokenPlayer],
    },
    teamB: {
        id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
        assistantCoachName: '', timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [],
        players: [],
    },
    finalScore: { teamA: 0, teamB: 0 },
    scoreHistory: [], statHistory: [], foulHistory: [],
    createdAt: new Date().toISOString(),
};

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('minibasket-game-history', JSON.stringify([brokenRecord]));
});

afterEach(cleanup);

function openDetail() {
    render(<History onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /第1節/ }));
}

describe('選手のstatsが欠けた試合レコード', () => {
    it('チーム比較を開いても落ちない', () => {
        expect(() => openDetail()).not.toThrow();
        expect(document.querySelector('.team-comparison')).toBeTruthy();
    });

    it('スタッツ表を開いても落ちない', () => {
        openDetail();

        expect(() => fireEvent.click(screen.getByRole('button', { name: 'スタッツ（画面表示）' }))).not.toThrow();
        expect(document.querySelectorAll('.stats-panel').length).toBe(2);
    });

    it('公式様式を開いても落ちない', () => {
        openDetail();

        expect(() => fireEvent.click(screen.getByRole('button', { name: 'スコアシート（保存/PDF）' }))).not.toThrow();
        expect(document.querySelector('.running-scoresheet')).toBeTruthy();
    });
});
