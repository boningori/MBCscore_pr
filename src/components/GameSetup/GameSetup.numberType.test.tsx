// 出場選手ステップの背番号は、選んだ番号タイプに従う。
//
// 番号タイプを決めるのは最後の確認ステップだったが、この一覧はそれより前に
// 番号を出す。しかも表示は bibNumber 固定で、あとからユニフォーム番号を選んでも
// 一覧は変わらなかった。ユニフォーム番号で運用するチームは、選んだ覚えのない
// 番号を先に見て、そのまま直せない（実測: 名簿の #4〜 が #14〜 で並ぶ）。
// 番号が最初に出る場所と、それを決める場所を同じステップに置く。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GameSetup } from './GameSetup';
import type { SavedTeam } from '../../utils/teamStorage';

function makeMyTeam(): SavedTeam {
    return {
        id: 't1', name: 'ホームチーム', coachName: 'コーチ', assistantCoachName: '',
        players: Array.from({ length: 5 }, (_, i) => ({
            number: 4 + i,
            uniformNumber: 4 + i,   // ユニフォームは 4,5,6,7,8
            bibNumber: 14 + i,      // ビブスは 14,15,16,17,18
            name: `選手${i + 1}`,
            isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function makeOpponent(): SavedTeam {
    return {
        id: 't2', name: 'アウェイチーム', coachName: 'コーチ', assistantCoachName: '',
        players: Array.from({ length: 5 }, (_, i) => ({
            number: 4 + i, name: `相手${i + 1}`, isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([makeMyTeam()]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([makeOpponent()]));
});

afterEach(cleanup);

function goToPlayersStep() {
    render(<GameSetup onComplete={() => { }} onBack={() => { }} />);
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByText('ホームチーム'));
}

const shownNumbers = () =>
    [...document.querySelectorAll('.player-check-list .player-number')].map(el => el.textContent);

describe('出場選手ステップの背番号', () => {
    it('既定はビブス番号', () => {
        goToPlayersStep();

        expect(shownNumbers()).toEqual(['#14', '#15', '#16', '#17', '#18']);
    });

    it('ユニフォーム番号に切り替えると一覧もそちらになる', () => {
        goToPlayersStep();

        fireEvent.click(screen.getByRole('radio', { name: 'ユニフォーム番号' }));

        expect(shownNumbers()).toEqual(['#4', '#5', '#6', '#7', '#8']);
    });

    it('ビブスへ戻せる', () => {
        goToPlayersStep();

        fireEvent.click(screen.getByRole('radio', { name: 'ユニフォーム番号' }));
        fireEvent.click(screen.getByRole('radio', { name: 'ビブス番号' }));

        expect(shownNumbers()).toEqual(['#14', '#15', '#16', '#17', '#18']);
    });

    // 選んだ内容は最後の確認ステップまで持ち越され、そこでは読むだけになる
    it('確認ステップには選んだ結果だけが出る', () => {
        goToPlayersStep();
        fireEvent.click(screen.getByRole('radio', { name: 'ユニフォーム番号' }));
        fireEvent.click(screen.getByRole('button', { name: '次へ' }));
        fireEvent.click(screen.getByText('アウェイチーム'));

        expect(screen.getByText('設定確認')).toBeTruthy();
        expect(screen.getByText('ユニフォーム番号')).toBeTruthy();
        // 操作子は置かない（どちらが効いているのか分からなくなる）
        expect(screen.queryByRole('radio', { name: 'ユニフォーム番号' })).toBeNull();
    });
});
