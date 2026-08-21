import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GameSetup } from './GameSetup';
import type { SavedTeam } from '../../utils/teamStorage';

function makeTeam(id: string, name: string): SavedTeam {
    return {
        id, name, coachName: 'コーチ', assistantCoachName: '',
        players: Array.from({ length: 5 }, (_, i) => ({
            number: 4 + i, name: `選手${i + 1}`, isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([makeTeam('t1', 'ホームチーム')]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([makeTeam('t2', 'アウェイチーム')]));
});

afterEach(cleanup);

/** 出場選手ステップまで進める */
function goToPlayersStep() {
    render(<GameSetup onComplete={() => { }} onBack={() => { }} />);
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByText('ホームチーム'));
}

/** 設定確認ステップまで進める */
function goToConfirmStep() {
    goToPlayersStep();
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByText('アウェイチーム'));
}

describe('設定確認ステップの選択肢グループ', () => {
    it.each([
        '3Pシュート',
        'クォーター時間',
    ])('「%s」が選択肢グループとして読み上げられる', groupName => {
        // 見出しがただの span だと、読み上げでは「ビブス番号 ラジオボタン」としか
        // 聞こえず、何を選んでいるグループなのか分からない。
        // radiogroup として名前を持たせる
        goToConfirmStep();

        expect(screen.getByRole('radiogroup', { name: groupName })).toBeTruthy();
    });

    // 番号タイプは出場選手ステップ（番号が最初に出る場所）へ移した。
    // 同じ操作子を2つのステップに置くと、どちらが効いているのか分からなくなる
    it('マイチームの使用番号は確認ステップでは操作子を出さない', () => {
        goToConfirmStep();

        expect(screen.queryByRole('radiogroup', { name: 'マイチームの使用番号' })).toBeNull();
        // 選んだ結果は読める
        expect(screen.getByText('マイチームの使用番号')).toBeTruthy();
        expect(screen.getByText('ビブス番号')).toBeTruthy();
    });
});

describe('出場選手ステップの番号タイプ', () => {
    it('選択肢グループとして読み上げられる', () => {
        goToPlayersStep();

        expect(screen.getByRole('radiogroup', { name: 'マイチームの使用番号' })).toBeTruthy();
    });

    it('各グループの選択肢はそのグループの中に属している', () => {
        goToPlayersStep();

        const numberGroup = screen.getByRole('radiogroup', { name: 'マイチームの使用番号' });
        const radios = numberGroup.querySelectorAll('input[type="radio"]');
        expect(radios).toHaveLength(2);
    });
});
