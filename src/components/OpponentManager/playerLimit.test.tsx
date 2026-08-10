import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { OpponentManager } from './OpponentManager';
import { OpponentSelect } from '../OpponentSelect';
import { MAX_PLAYERS_PER_TEAM } from '../../types/game';
import type { SavedTeam } from '../../utils/teamStorage';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../Toast/toastApi', () => ({ showToast }));

vi.mock('../../utils/imageOCR', () => ({
    recognizePlayerList: vi.fn(),
    isOCRAvailable: () => false,
    getStoredApiKey: () => '',
}));

// 公式スコアシートの選手欄は15人分しかなく、RunningScoresheet も
// players.slice(0, 15) で描画している。マイチーム側は15人で止まるのに
// 対戦チーム側だけ上限が無く、16人目以降は得点だけがチーム合計に乗って
// スコアシートからは消える（合計と個人欄が合わない提出物になる）。

/** 満員（15人）の対戦チーム */
function fullTeam(): SavedTeam {
    return {
        id: 'opp-1',
        name: '西陵ミニバス',
        coachName: '佐々木',
        assistantCoachName: '',
        players: Array.from({ length: MAX_PLAYERS_PER_TEAM }, (_, i) => ({
            number: i + 1, name: `選手${i + 1}`, isCaptain: false,
        })),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

/** 番号を直接入力して「追加」を押す */
function addPlayerByNumber(number: string) {
    fireEvent.change(screen.getByPlaceholderText('No.'), { target: { value: number } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
}

function countPlayerChips(): number {
    return screen.getAllByText(/^#\d|^#00/).length;
}

beforeEach(() => {
    localStorage.clear();
    showToast.mockReset();
});

afterEach(cleanup);

describe('対戦チームの選手数上限（OpponentManager）', () => {
    beforeEach(() => {
        localStorage.setItem('minibasket-saved-opponents', JSON.stringify([fullTeam()]));
    });

    it('15人を超えて追加できない', () => {
        render(<OpponentManager onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '編集' }));

        expect(screen.getByText(`選手登録 (${MAX_PLAYERS_PER_TEAM}人)`)).toBeTruthy();
        addPlayerByNumber('42');

        expect(screen.getByText(`選手登録 (${MAX_PLAYERS_PER_TEAM}人)`)).toBeTruthy();
    });

    it('上限に達している理由を知らせる', () => {
        render(<OpponentManager onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '編集' }));
        addPlayerByNumber('42');

        expect(showToast).toHaveBeenCalledWith(
            expect.stringContaining(`${MAX_PLAYERS_PER_TEAM}人`),
            'error',
        );
    });

    it('番号一括選択でも15人を超えない', () => {
        render(<OpponentManager onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '編集' }));
        fireEvent.click(screen.getByRole('button', { name: '# 番号一括選択' }));

        // 未登録の番号（16〜）を押しても増えない
        fireEvent.click(screen.getByRole('button', { name: '42' }));

        expect(screen.getByText(`選手登録 (${MAX_PLAYERS_PER_TEAM}人)`)).toBeTruthy();
    });

    it('登録済みの番号は上限に達していても外せる（詰みにしない）', () => {
        render(<OpponentManager onBack={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '編集' }));
        fireEvent.click(screen.getByRole('button', { name: '# 番号一括選択' }));

        fireEvent.click(screen.getByRole('button', { name: '1' }));

        expect(screen.getByText(`選手登録 (${MAX_PLAYERS_PER_TEAM - 1}人)`)).toBeTruthy();
    });
});

describe('対戦チームの選手数上限（試合設定の未登録チーム入力）', () => {
    it('15人を超えて追加できない', () => {
        render(<OpponentSelect onSelect={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '+ 未登録チームと対戦' }));
        fireEvent.click(screen.getByRole('button', { name: '# 番号一括選択' }));

        for (let n = 1; n <= MAX_PLAYERS_PER_TEAM; n++) {
            fireEvent.click(screen.getByRole('button', { name: String(n) }));
        }
        expect(screen.getByText(`選手登録 (${MAX_PLAYERS_PER_TEAM}人)`)).toBeTruthy();
        expect(countPlayerChips()).toBe(MAX_PLAYERS_PER_TEAM);

        fireEvent.click(screen.getByRole('button', { name: '42' }));

        expect(screen.getByText(`選手登録 (${MAX_PLAYERS_PER_TEAM}人)`)).toBeTruthy();
        expect(countPlayerChips()).toBe(MAX_PLAYERS_PER_TEAM);
    });
});
