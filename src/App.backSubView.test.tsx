import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';

// 端末の戻る操作は画面（AppScreen）単位でしか同期されていなかった。
// 各画面が持つサブビュー —— マイチームの編集フォーム、選手スタッツの詳細、
// 履歴の試合詳細 —— はローカルstateで履歴に存在しないため、戻ると1段上ではなく
// ホームまで飛んでいた。画面上の「← 戻る」は1段だけ戻すので、同じ「戻る」で
// ハードとソフトの挙動が食い違っていたことになる。
// 名簿の編集フォームは入力量が多く、確認なしに消えるのがいちばん痛い。

const myTeam = {
    id: 'team-1',
    name: 'テストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    players: Array.from({ length: 6 }, (_, i) => ({
        number: i + 4,
        name: `選手${i + 4}`,
        isCaptain: i === 0,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

const gameRecord = {
    id: 'g1',
    date: new Date(2026, 5, 5).toISOString(),
    gameName: '第1節',
    teamA: {
        ...myTeam,
        color: 'white',
        teamFouls: [0, 0, 0, 0],
        timeouts: [],
        isMyTeam: true,
        savedTeamId: 'team-1',
        players: myTeam.players.map((p, i) => ({
            id: `p${i}`,
            number: p.number,
            name: p.name,
            isCaptain: p.isCaptain,
            isOnCourt: false,
            fouls: [],
            quartersPlayed: ['starter', false, false, false],
            stats: {
                points: 10, twoPointMade: 5, twoPointAttempt: 9, threePointMade: 0, threePointAttempt: 0,
                freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 2, defensiveRebounds: 3,
                assists: 2, steals: 1, blocks: 0, turnovers: 1,
                turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
            },
        })),
    },
    teamB: {
        id: 't-blue', name: 'ブルーミニバス', color: 'blue', coachName: 'C',
        players: [], teamFouls: [0, 0, 0, 0], timeouts: [],
    },
    finalScore: { teamA: 60, teamB: 20 },
    scoreHistory: [], statHistory: [], foulHistory: [],
    createdAt: new Date().toISOString(),
};

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-game-history', JSON.stringify([gameRecord]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    window.history.replaceState(null, '');
});
// useScreenHistorySync はアプリ内でホームへ戻るとき window.history.back() を使う。
// jsdomでは popstate が非同期に届くので、待たずに次のテストへ進むと、次に描画した
// Appがその popstate を受け取って画面が飛ぶ。積み残しを流してから片付ける
afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    cleanup();
});

/** 端末の戻る操作。ブラウザは先に1段戻し、stateはホームになっている */
function pressBack() {
    fireEvent.popState(window, { state: { appScreen: 'home' } });
}

describe('端末の戻る操作: マイチームの編集フォーム', () => {
    it('編集フォームからはチーム一覧へ戻る（ホームまで飛ばない）', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('マイチーム管理'));
        fireEvent.click(await screen.findByText('編集'));
        const nameInput = await screen.findByDisplayValue('テストチーム');
        fireEvent.change(nameInput, { target: { value: '変更後チーム名' } });

        pressBack();

        expect(await screen.findByText('+ 新規チーム作成')).toBeTruthy();
        expect(screen.queryByText('新規試合開始')).toBeNull();
    });

    it('一覧まで戻ったあとの戻るでホームへ抜ける', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('マイチーム管理'));
        fireEvent.click(await screen.findByText('編集'));
        await screen.findByDisplayValue('テストチーム');

        pressBack();
        await screen.findByText('+ 新規チーム作成');
        pressBack();

        expect(await screen.findByText('新規試合開始')).toBeTruthy();
    });
});

// 選手スタッツ分析の詳細は、同じ仕組みを使っていることを
// PlayerStatsAnalysis/backToSummary.test.tsx で確かめる
// （closeTopModal に直接繋いで、画面遷移の配線を挟まずに見る）

describe('端末の戻る操作: 試合履歴の詳細', () => {
    it('試合詳細からは履歴一覧へ戻る（ホームまで飛ばない）', async () => {
        render(<App />);
        fireEvent.click(await screen.findByText('試合履歴'));
        fireEvent.click(document.querySelector('.history-card-main')!);
        expect(await screen.findByText('← 一覧に戻る')).toBeTruthy();

        pressBack();

        expect(screen.queryByText('← 一覧に戻る')).toBeNull();
        expect(screen.queryByText('新規試合開始')).toBeNull();
        expect(document.querySelector('.history-card-main')).toBeTruthy();
    });
});
