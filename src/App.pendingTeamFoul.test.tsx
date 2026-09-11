// 保留ファウルは、解決されるまでチームファウルに入らない。
//
// 「誰のファウルか分からない」は試合中ふつうに起きる（背番号が見えなかった、
// 審判のコールが聞き取れなかった）。その場では保留にして、あとから割り当てる。
// ところが保留の間、チームファウルの数だけが実態より少ないままになる。
//
// これは表示の問題では済まない。FoulInputFlow は teamFouls >= 4 を見て
// フリースローの本数を提案する（suggestFreeThrowCount）ので、保留が1件あると
// 「本当はペナルティなのにFT0本」を提案する。記録者がその提案を信じれば、
// FTの本数そのもの——つまり得点——を取り違える。
//
// ファウルが起きた事実はチームに帰属していて、誰が犯したかは関係ない。
// 解決を待たずに数える。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';
import type { Game, Player } from './types/game';
import { createPendingAction } from './types/pendingAction';
import type { PendingAction } from './types/pendingAction';

const onCourt = (p: Player): Player => ({ ...p, isOnCourt: true });

const myTeam = {
    id: 'team-1',
    name: 'ホームチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: 'ホーム1', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/**
 * 第1Qで、ホームのチームファウルが recordedFouls 個まで記録され、
 * さらに保留ファウルが pendings 件ある中断セッションを作る。
 */
function seedSession(recordedFouls: number, pendings: PendingAction[]) {
    const teamA = createTeam('teamA', 'ホームチーム', 'コーチ');
    teamA.players = Array.from({ length: 5 }, (_, i) => onCourt(createPlayer(`a${i}`, 4 + i, `ホーム${i + 1}`)));
    teamA.teamFouls = [recordedFouls, 0, 0, 0];

    const teamB = createTeam('teamB', 'アウェイチーム', 'コーチB');
    teamB.players = Array.from({ length: 5 }, (_, i) => onCourt(createPlayer(`b${i}`, 11 + i, `アウェイ${i + 1}`)));

    const game: Game = {
        ...createInitialGame(),
        teamA,
        teamB,
        phase: 'playing',
        pendingActions: pendings,
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game,
        gameName: 'テスト大会',
        date: '2026-09-11',
        savedAt: new Date().toISOString(),
    }));
}

const pendingFoul = (teamId: 'teamA' | 'teamB', quarter: number): PendingAction =>
    createPendingAction('FOUL', '', teamId, quarter, []);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

function resume() {
    render(<App />);
    fireEvent.click(screen.getByText('試合を再開'));
}

/** ホームの選手を選んでファウル入力を開く */
function openFoulInput() {
    // 選手カードは読み上げ名に背番号・得点まで含むので、名前で引く
    fireEvent.click(screen.getByRole('button', { name: /ホーム1/ }));
    fireEvent.click(screen.getByText('ファウル').closest('button')!);
}

describe('保留ファウルとチームファウル', () => {
    it('保留ファウルもチームファウルの数に入れる', () => {
        seedSession(3, [pendingFoul('teamA', 1)]);
        resume();
        openFoulInput();

        expect(screen.getByText(/チームファウル: 4個/)).toBeTruthy();
    });

    it('保留で4個目に達したら、そのファウルからペナルティと案内する', () => {
        seedSession(3, [pendingFoul('teamA', 1)]);
        resume();
        openFoulInput();

        expect(screen.getByText(/このファウルからペナルティ/)).toBeTruthy();
    });

    it('相手チームの保留は、こちらのチームファウルに入れない', () => {
        seedSession(3, [pendingFoul('teamB', 1)]);
        resume();
        openFoulInput();

        expect(screen.getByText(/チームファウル: 3個/)).toBeTruthy();
        expect(screen.queryByText(/このファウルからペナルティ/)).toBeNull();
    });

    it('別のピリオドの保留は、いまのピリオドのチームファウルに入れない', () => {
        seedSession(3, [pendingFoul('teamA', 2)]);
        resume();
        openFoulInput();

        expect(screen.getByText(/チームファウル: 3個/)).toBeTruthy();
    });

    // ヘッダーのTFバッジと、ファウル入力の案内が別の数を出すと、
    // どちらを信じればよいのか記録者には分からない
    it('TFバッジも同じ数を出す', () => {
        seedSession(3, [pendingFoul('teamA', 1)]);
        resume();

        expect(screen.getByText('TF 4')).toBeTruthy();
    });
});

