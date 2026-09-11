// 未割り当ての得点が残ったまま、第4Q終了に進んだとき。
//
// 保留の得点はどの選手のスタッツにも入らない。一方で第4Q終了の分岐——
// 同点なら「延長戦へ」、そうでなければ「試合終了」——は選手スタッツの総和で
// 決まる（App の handleQuarterEnd と、reducer の handleEndQuarter）。
// つまり保留が1件でもあると、同点でないのに延長戦を勧める／同点なのに
// 試合終了へ落とす、が起きる。延長戦をするかどうかは試合の結論そのものなので、
// ここを黙って通してはいけない。
//
// 保留の点数を判定に足し込む手もあるが、それだとスコアボードの数字と
// ダイアログの言い分が食い違う（画面は40-38なのに「同点で終了しました」）。
// 決めるのは記録者で、決める材料は数秒で揃う——割り当ててから進んでもらう。
//
// 試合終了の保存前にも同じ趣旨の警告があるが（App.pendingActionFinish）、
// あちらはもう結論が出たあと。延長戦の有無はそれより手前で決まる。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer } from './types/game';
import { createPendingAction } from './types/pendingAction';
import type { PendingAction } from './types/pendingAction';

const WARNING_TITLE = '未割り当ての得点があります';

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: [{ number: 4, name: '選手4', isCaptain: true }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

/** 第4Q進行中・両チーム同点（0-0）のセッションを、保留付きで仕込む */
function seedPlayingQ4(pendings: PendingAction[]) {
    const game = createInitialGame();
    game.phase = 'playing';
    game.currentQuarter = 4;
    game.teamA = {
        ...createTeam('teamA', 'テストチーム', 'コーチ'),
        players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
    };
    game.pendingActions = pendings;
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-09-11', savedAt: new Date().toISOString(),
    }));
}

const pendingScore = (): PendingAction =>
    createPendingAction('SCORE', '2P', 'teamB', 4, []);
const pendingFoul = (): PendingAction =>
    createPendingAction('FOUL', '', 'teamB', 4, []);
const pendingStat = (): PendingAction =>
    createPendingAction('STAT', 'OREB', 'teamB', 4, []);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
});

afterEach(cleanup);

/** 試合を再開し、第4Q終了を押す */
async function pressQuarterEnd() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合を再開'));
    fireEvent.click(await screen.findByText(/第4Q終了|Q4終了/));
}

describe('第4Q終了時の未割り当て得点', () => {
    it('得点の保留が残っていたら、試合終了の確認より先に知らせる', async () => {
        seedPlayingQ4([pendingScore()]);
        await pressQuarterEnd();

        expect(await screen.findByText(WARNING_TITLE)).toBeTruthy();
        expect(screen.queryByText('試合終了の確認')).toBeNull();
    });

    it('割り当てに戻れる（試合は終わらない）', async () => {
        seedPlayingQ4([pendingScore()]);
        await pressQuarterEnd();
        fireEvent.click(await screen.findByText('戻って割り当てる'));

        expect(screen.queryByText(WARNING_TITLE)).toBeNull();
        expect(screen.queryByText('試合終了の確認')).toBeNull();
        // 記録画面に残っている
        expect(screen.getByText(/第4Q終了|Q4終了/)).toBeTruthy();
    });

    it('承知のうえで進めば、これまでどおり試合終了の確認へ行く', async () => {
        seedPlayingQ4([pendingScore()]);
        await pressQuarterEnd();
        fireEvent.click(await screen.findByText('このまま進む'));

        expect(await screen.findByText('試合終了の確認')).toBeTruthy();
    });

    it('得点の保留が無ければ、これまでどおり素通しする', async () => {
        seedPlayingQ4([]);
        await pressQuarterEnd();

        expect(await screen.findByText('試合終了の確認')).toBeTruthy();
    });

    // ファウルとスタッツは勝敗を動かさない。ここで止めると、
    // 結論に関係のない保留で試合終了の手を止めることになる
    it('ファウル・スタッツだけの保留では止めない', async () => {
        seedPlayingQ4([pendingFoul(), pendingStat()]);
        await pressQuarterEnd();

        expect(await screen.findByText('試合終了の確認')).toBeTruthy();
        expect(screen.queryByText(WARNING_TITLE)).toBeNull();
    });
});

describe('第1〜3Qの終了', () => {
    // 勝敗が決まるのは第4Q以降だけ。途中のピリオドで止めると、
    // 割り当てを急かす理由が無いのに記録の流れを毎回せき止めることになる
    it('得点の保留が残っていても、途中のピリオドは止めない', async () => {
        const game = createInitialGame();
        game.phase = 'playing';
        game.currentQuarter = 2;
        game.teamA = {
            ...createTeam('teamA', 'テストチーム', 'コーチ'),
            players: [{ ...createPlayer('teamA-player-0', 4, '選手4'), isOnCourt: true }],
        };
        game.teamB = {
            ...createTeam('teamB', '相手チーム', '相手コーチ'),
            players: [{ ...createPlayer('teamB-player-0', 5, '選手5'), isOnCourt: true }],
        };
        game.pendingActions = [createPendingAction('SCORE', '2P', 'teamB', 2, [])];
        localStorage.setItem('minibasket-game-session', JSON.stringify({
            game, gameName: '練習試合', date: '2026-09-11', savedAt: new Date().toISOString(),
        }));

        render(<App />);
        fireEvent.click(await screen.findByText('試合を再開'));
        fireEvent.click(await screen.findByText(/第2Q終了|Q2終了/));

        expect(screen.queryByText(WARNING_TITLE)).toBeNull();
    });
});
