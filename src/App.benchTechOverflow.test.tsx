// 交代要員のテクニカルは選手行に「T」を書く＝様式のファウル欄（5枠）を消費する。
// ベンチファウルの入力は shooter ステップから始まり FoulInputFlow の
// 種類選択を通らないため、そちらのゲートでは捕まらない。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';
import type { FoulType, Game, Player } from './types/game';

const CONFIRM_TITLE = 'このファウルは6個目です';

const onCourt = (p: Player): Player => ({ ...p, isOnCourt: true });
const withFouls = (p: Player, n: number): Player => ({
    ...p,
    fouls: Array.from({ length: n }, () => 'P' as FoulType),
});

/** ベンチに「5ファウルの選手」と「1ファウルの選手」がいる中断セッションを作る */
function seedSession() {
    const teamA = createTeam('teamA', 'ホームチーム', 'コーチ');
    teamA.players = [
        ...Array.from({ length: 5 }, (_, i) => onCourt(createPlayer(`a${i}`, 4 + i, `ホーム${i + 1}`))),
        withFouls(createPlayer('bench-five', 20, 'ベンチ五郎'), 5),
        withFouls(createPlayer('bench-one', 21, 'ベンチ一郎'), 1),
    ];
    const teamB = createTeam('teamB', 'アウェイチーム', 'コーチB');
    teamB.players = Array.from({ length: 5 }, (_, i) => onCourt(createPlayer(`b${i}`, 11 + i, `アウェイ${i + 1}`)));

    const game: Game = { ...createInitialGame(), teamA, teamB, phase: 'playing' };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game,
        gameName: 'テスト大会',
        date: '2026-08-18',
        savedAt: new Date().toISOString(),
    }));
}

// Home画面は「マイチーム」が1件も登録されていないとオンボーディング表示
// （「マイチームを登録」）になり「試合を再開」ボタン自体が出ない。
// brief記載のseedSessionにはこの登録が抜けていたため補っている。
const myTeam = {
    id: 'team-1',
    name: 'ホームチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: 'ホーム1', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    seedSession();
});

afterEach(cleanup);

/** 中断セッションを再開し、ホームチームの交代要員選択まで進める */
function openBenchPlayerSelect() {
    render(<App />);
    fireEvent.click(screen.getByText('試合を再開'));
    // ベンチファウルは両チーム分あるので、先頭（ホーム）を使う
    fireEvent.click(screen.getAllByRole('button', { name: /ベンチ\s*ファウル/ })[0]);
    fireEvent.click(screen.getByText(/交代要員/).closest('button')!);
}

describe('交代要員のテクニカル: 6個目以降の確認', () => {
    it('5ファウルのベンチ選手を選ぶと確認が出る', () => {
        openBenchPlayerSelect();

        fireEvent.click(screen.getByText('ベンチ五郎').closest('button')!);

        expect(screen.getByText(CONFIRM_TITLE)).toBeTruthy();
    });

    it('1ファウルのベンチ選手を選ぶと確認なしでFT入力へ進む', () => {
        openBenchPlayerSelect();

        fireEvent.click(screen.getByText('ベンチ一郎').closest('button')!);

        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(screen.getByText(/シューター選択/)).toBeTruthy();
    });

    it('確認で「やめる」を押すと選手選択に留まる', () => {
        openBenchPlayerSelect();
        fireEvent.click(screen.getByText('ベンチ五郎').closest('button')!);

        fireEvent.click(screen.getByRole('button', { name: 'やめる' }));

        expect(screen.queryByText(CONFIRM_TITLE)).toBeNull();
        expect(screen.getByText(/交代要員を選択/)).toBeTruthy();
    });

    it('確認で「記録する」を押すとFT入力へ進む', () => {
        openBenchPlayerSelect();
        fireEvent.click(screen.getByText('ベンチ五郎').closest('button')!);

        fireEvent.click(screen.getByRole('button', { name: '記録する' }));

        expect(screen.getByText(/シューター選択/)).toBeTruthy();
    });
});
