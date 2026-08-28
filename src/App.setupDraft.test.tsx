// 試合設定はウィザードの入力途中の状態をローカルstateで持っている。スタメン選択へ
// 進むと画面ごとアンマウントされるため、そこから1段戻ると試合名・チーム・出場選手・
// 3P/クォーター設定が全部消えて1/5の「基本情報」からやり直しになっていた
// （画面上の「← 戻る」でもAndroidのエッジスワイプでも起きる）。対戦相手を選び
// 間違えたと気づいて1段戻すのはいちばん自然な使い方なので、戻り先は確認ステップで
// なければならない。
//
// 一方、ホームへ抜けたあとの「新規試合開始」は最初からでなければならない。
// 前に諦めた設定が出てくると、別の試合を前の設定で記録してしまう。

import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from './App';

const myTeam = {
    id: 'team-1',
    name: 'マイテストチーム',
    coachName: 'コーチ',
    assistantCoachName: '',
    // 出場選手ステップの「次へ」は5人以上でないと押せない
    players: Array.from({ length: 5 }, (_, i) => ({
        number: 4 + i, name: `選手${4 + i}`, isCaptain: i === 0,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

const opponent = {
    id: 'opp-1',
    name: 'アイテコウチーム',
    coachName: '相手コーチ',
    assistantCoachName: '',
    players: Array.from({ length: 5 }, (_, i) => ({
        number: 20 + i, name: `相手${20 + i}`, isCaptain: i === 0,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-saved-opponents', JSON.stringify([opponent]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 1 }));
    window.history.replaceState(null, '');
});

// アプリ内でホームへ戻ると window.history.back() が走る。jsdomでは popstate が
// 非同期に届くため、流してから片付ける（App.backGameSubScreen.test.tsx と同じ理由）
afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    cleanup();
});

/** 端末の戻る操作。ブラウザは先に1段戻し、stateはホームになっている */
function pressBack() {
    fireEvent.popState(window, { state: { appScreen: 'home' } });
}

/** ホームからウィザードを最後まで進めて、スタメン選択に立つ */
function walkToLineup() {
    fireEvent.click(screen.getByRole('button', { name: /新規試合開始/ }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));           // 1/5 基本情報
    fireEvent.click(screen.getByRole('button', { name: /マイテストチーム/ })); // 2/5 マイチーム
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));           // 3/5 出場選手
    fireEvent.click(screen.getByRole('button', { name: /アイテコウチーム/ })); // 4/5 対戦チーム
    fireEvent.click(screen.getByRole('button', { name: 'スタメン選択へ' }));   // 5/5 確認
}

describe('試合設定の下書き', () => {
    it('スタメン選択から戻ると、確認ステップに入力内容ごと戻る', () => {
        render(<App />);
        walkToLineup();
        expect(screen.getByRole('heading', { name: 'スタメン選択' })).toBeTruthy();

        pressBack();

        // 1/5 の「基本情報」ではなく 5/5 の「設定確認」
        expect(screen.getByRole('heading', { name: '設定確認' })).toBeTruthy();
        // 選んだチームが残っている（消えていれば confirm には立てない）
        expect(screen.getAllByText('マイテストチーム').length).toBeGreaterThan(0);
        expect(screen.getAllByText('アイテコウチーム').length).toBeGreaterThan(0);
        // ここからもう一度進める
        expect(screen.getByRole('button', { name: 'スタメン選択へ' })).toBeTruthy();
    });

    it('画面上の「← 戻る」でも同じところに戻る', () => {
        render(<App />);
        walkToLineup();

        fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));

        expect(screen.getByRole('heading', { name: '設定確認' })).toBeTruthy();
    });

    it('3P・クォーター時間の変更も残る', () => {
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /新規試合開始/ }));
        fireEvent.click(screen.getByRole('button', { name: '次へ' }));
        fireEvent.click(screen.getByRole('button', { name: /マイテストチーム/ }));
        fireEvent.click(screen.getByRole('button', { name: '次へ' }));
        fireEvent.click(screen.getByRole('button', { name: /アイテコウチーム/ }));

        fireEvent.click(screen.getByRole('radio', { name: /使う$/ }));
        fireEvent.click(screen.getByRole('radio', { name: '5分' }));
        fireEvent.click(screen.getByRole('button', { name: 'スタメン選択へ' }));

        pressBack();

        expect((screen.getByRole('radio', { name: /使う$/ }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('radio', { name: '5分' }) as HTMLInputElement).checked).toBe(true);
    });

    it('ホームへ抜けたら次の新規試合は最初から', () => {
        render(<App />);
        walkToLineup();
        pressBack();

        // 設定確認から「← 戻る」を4回でホームまで戻る
        for (let i = 0; i < 4; i++) {
            fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));
        }
        fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));

        fireEvent.click(screen.getByRole('button', { name: /新規試合開始/ }));

        expect(screen.getByRole('heading', { name: '基本情報' })).toBeTruthy();
    });
});
