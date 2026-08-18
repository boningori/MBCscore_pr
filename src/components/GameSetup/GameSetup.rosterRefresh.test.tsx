// 試合設定の途中でマイチームの名簿を直したら、その試合に反映されること。
//
// 試合設定は登録チーム一覧をマウント時に1回だけ読み込んでいた。中から
// 「チーム管理・新規登録」でマイチーム管理を開いて名簿を直しても、戻った
// 一覧は古いまま。新しく作ったチームは出てこず、選手を足したチームを選ぶと
// 足す前の名簿のまま試合が始まる（記録画面に出ない選手ができる）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GameSetup } from './GameSetup';
import { saveMyTeam, type SavedTeam, type SavedPlayer } from '../../utils/teamStorage';

const player = (n: number): SavedPlayer => ({
    number: n, bibNumber: n, name: `選手${n}`, isCaptain: false,
});

function team(playerCount: number): SavedTeam {
    return {
        id: 't6', name: '6年生チーム', coachName: 'コーチ', assistantCoachName: '',
        players: Array.from({ length: playerCount }, (_, i) => player(4 + i)),
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

/** 試合情報ステップを通ってマイチーム選択ステップまで進む */
function goToMyTeamStep() {
    fireEvent.click(screen.getByRole('button', { name: /次へ/ }));
}

const openManager = () => fireEvent.click(screen.getByRole('button', { name: 'チーム管理・新規登録' }));
const closeManager = () => fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));

beforeEach(() => {
    localStorage.clear();
    saveMyTeam(team(5));
});
afterEach(cleanup);

describe('試合設定とマイチーム名簿', () => {
    it('マイチーム管理で選手を足したら、戻った一覧の人数が増える', () => {
        render(<GameSetup onComplete={() => { }} onBack={() => { }} />);
        goToMyTeamStep();
        expect(screen.getByText('5名')).toBeTruthy();

        openManager();
        // マイチーム管理の中での保存と同じこと（saveMyTeam）を起こす
        saveMyTeam(team(6));
        closeManager();

        expect(screen.getByText('6名')).toBeTruthy();
        expect(screen.queryByText('5名')).toBeNull();
    });

    it('選んだチームの名簿を直したら、出場選手の確認にも新しい名簿が出る', () => {
        render(<GameSetup onComplete={() => { }} onBack={() => { }} />);
        goToMyTeamStep();
        // 先にチームを選んでから名簿を直す
        fireEvent.click(screen.getByText('6年生チーム'));
        expect(screen.getByText(/出場:/).textContent).toContain('5');

        // マイチーム選択へ戻ってから管理画面で1人追加する
        fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));
        openManager();
        saveMyTeam(team(6));
        closeManager();

        fireEvent.click(screen.getByText('6年生チーム'));
        expect(screen.getByText(/出場:/).textContent).toContain('6');
        expect(screen.getByText('選手9')).toBeTruthy();
    });

    it('新しく登録したチームが一覧に出る', () => {
        render(<GameSetup onComplete={() => { }} onBack={() => { }} />);
        goToMyTeamStep();

        openManager();
        saveMyTeam({ ...team(5), id: 't5', name: '5年生チーム' });
        closeManager();

        expect(screen.getByText('5年生チーム')).toBeTruthy();
    });
});
