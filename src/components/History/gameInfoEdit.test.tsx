// 履歴から試合情報・終了時間を直したあと、一覧に戻ってもう一度開いたときに
// その内容が残っていること。
//
// 履歴一覧（records）はマウント時に1回だけ読み込み、削除のときしか読み直して
// いなかった。試合情報を保存すると localStorage には書かれるが一覧側の複製は
// 古いままで、一覧に戻ってから開き直すと入力が消えて見える。さらに2回目の編集は
// その古い複製を土台に上書きするため、1回目に入れた内容が本当に失われる。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';
import { loadGameRecord } from '../../utils/gameHistoryStorage';

const GAME_ID = 'g1';

function seed() {
    const emptyStats = {
        points: 0, twoPointMade: 0, twoPointAttempt: 0, threePointMade: 0, threePointAttempt: 0,
        freeThrowMade: 0, freeThrowAttempt: 0, offensiveRebounds: 0, defensiveRebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0,
        turnoverDD: 0, turnoverTR: 0, turnoverPM: 0, turnoverCM: 0,
    };
    const team = (id: string, name: string, color: 'white' | 'blue') => ({
        id, name, coachName: 'コーチ', assistantCoachName: '', color,
        players: [{
            id: id + '-p1', number: 4, name: '田中', isCaptain: false, fouls: [], isOnCourt: false,
            quartersPlayed: ['starter', false, false, false], stats: { ...emptyStats },
        }],
        timeouts: [], teamFouls: [0, 0, 0, 0], coachFouls: [], assistantCoachFouls: [], benchFouls: [],
    });
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: GAME_ID, date: new Date(Date.UTC(2026, 3, 10)).toISOString(), gameName: '第1節',
        teamA: team('teamA', '6年生チーム', 'white'), teamB: team('teamB', '相手', 'blue'),
        finalScore: { teamA: 0, teamB: 0 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        gameInfo: {
            venue: '', time: '', gameNo: '', crewChief: '', umpire: '',
            scorer: '', assistantScorer: '', timer: '', shotClockOperator: '',
        },
        quarterMinutes: 6, showThreePoint: false, createdAt: new Date().toISOString(),
    }]));
}

/** 一覧 →（試合を開く）→ スコアシート → 試合情報モーダル まで進む */
function openGameInfoModal() {
    fireEvent.click(document.querySelector('.history-card-main') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'スコアシート（保存/PDF）' }));
    fireEvent.click(screen.getByRole('button', { name: '試合情報編集' }));
}

function fillAndSave(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
}

function backToList() {
    fireEvent.click(screen.getByRole('button', { name: '← 一覧に戻る' }));
}

beforeEach(() => {
    localStorage.clear();
    seed();
});
afterEach(cleanup);

describe('履歴から試合情報を編集する', () => {
    it('保存した会場が、一覧に戻って開き直しても残る', () => {
        render(<History onBack={() => { }} />);

        openGameInfoModal();
        fillAndSave('会場', '中央体育館');
        backToList();
        openGameInfoModal();

        expect((screen.getByLabelText('会場') as HTMLInputElement).value).toBe('中央体育館');
    });

    it('2回目の編集で、1回目に入れた内容を消さない', () => {
        render(<History onBack={() => { }} />);

        openGameInfoModal();
        fillAndSave('会場', '中央体育館');
        backToList();
        openGameInfoModal();
        fillAndSave('クルーチーフ', '山田');

        const saved = loadGameRecord(GAME_ID);
        expect(saved?.gameInfo?.venue).toBe('中央体育館');
        expect(saved?.gameInfo?.crewChief).toBe('山田');
    });

    // 「保存」1回で onSave と onEndTimeChange が続けて走る。同じ selectedRecord から
    // それぞれ新しい値を組み立てると、あとの更新が前の変更ごと画面から巻き戻す
    it('同じ保存で終了時間も直しても、試合情報の入力が残る', () => {
        render(<History onBack={() => { }} />);

        openGameInfoModal();
        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '中央体育館' } });
        fireEvent.change(screen.getByLabelText('終了時間'), { target: { value: '11:45' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        // 詳細に留まったまま開き直す（一覧を経由しなくても巻き戻ってはいけない）
        fireEvent.click(screen.getByRole('button', { name: '試合情報編集' }));
        expect((screen.getByLabelText('会場') as HTMLInputElement).value).toBe('中央体育館');
        expect((screen.getByLabelText('終了時間') as HTMLInputElement).value).toBe('11:45');
    });
});
