import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { OpponentManager } from './OpponentManager';
import { loadOpponents } from '../../utils/teamStorage';
import type { SavedTeam } from '../../utils/teamStorage';
import { findUnlabeledFields } from '../../test/accessibleNames';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../Toast/toastApi', () => ({ showToast }));

// OCRはネットワーク/ワーカーを触るので、この画面のCRUD検証では読み込ませない
vi.mock('../../utils/imageOCR', () => ({
    recognizePlayerList: vi.fn(),
    getStoredApiKey: () => '',
}));

function team(overrides: Partial<SavedTeam> = {}): SavedTeam {
    return {
        id: 'opp-1',
        name: '西陵ミニバス',
        coachName: '佐々木',
        assistantCoachName: '',
        players: [4, 5, 6, 7, 8].map(n => ({ number: n, name: `選手${n}`, isCaptain: false })),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function seed(teams: SavedTeam[]) {
    localStorage.setItem('minibasket-saved-opponents', JSON.stringify(teams));
}

function openEditor() {
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
}

beforeEach(() => {
    localStorage.clear();
    showToast.mockReset();
});

afterEach(cleanup);

describe('OpponentManager: 一覧と削除', () => {
    it('登録済みチームを並べる', () => {
        seed([team()]);
        render(<OpponentManager onBack={vi.fn()} />);
        expect(screen.getByText('西陵ミニバス')).toBeTruthy();
    });

    it('削除は確認してから実行する', () => {
        seed([team()]);
        render(<OpponentManager onBack={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: '削除' }));
        expect(loadOpponents()).toHaveLength(1);

        const dialog = screen.getByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

        expect(loadOpponents()).toHaveLength(0);
    });
});

describe('OpponentManager: 保存時の検証', () => {
    it('チーム名が空なら保存せず知らせる', () => {
        seed([team({ name: '' })]);
        render(<OpponentManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(showToast).toHaveBeenCalledWith('チーム名を入力してください', 'error');
        expect(loadOpponents()[0].name).toBe('');
    });

    it('選手が5人未満なら保存せず知らせる', () => {
        seed([team({ players: team().players.slice(0, 4) })]);
        render(<OpponentManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(showToast).toHaveBeenCalledWith('最低5人の選手を登録してください', 'error');
    });

    it('条件を満たせば保存され、一覧に戻る', () => {
        seed([team()]);
        render(<OpponentManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('チーム名 *'), { target: { value: '西陵ミニバスB' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(loadOpponents()[0].name).toBe('西陵ミニバスB');
        expect(screen.getByRole('button', { name: '+ 新規チーム登録' })).toBeTruthy();
    });
});

describe('OpponentManager: 選手の追加', () => {
    it('背番号が重複したら知らせて追加しない', () => {
        seed([team()]);
        render(<OpponentManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('背番号'), { target: { value: '4' } });
        fireEvent.click(screen.getByRole('button', { name: '追加' }));

        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('既に登録されています'), 'error');
    });

    it('空いている番号なら氏名が無くても追加できる（対戦相手は番号だけ分かることが多い）', () => {
        seed([team()]);
        render(<OpponentManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('背番号'), { target: { value: '9' } });
        fireEvent.click(screen.getByRole('button', { name: '追加' }));

        // 追加された選手は一覧に表示される（氏名未入力なら「選手9」が自動で入る）
        expect(screen.getByText('選手9')).toBeTruthy();
    });
});

describe('OpponentManager: コーチ欄の読み上げ', () => {
    it('氏名とライセンスNo.が別々の名前で読める', () => {
        seed([team()]);
        render(<OpponentManager onBack={vi.fn()} />);
        openEditor();

        expect(screen.getByLabelText('コーチ')).toBeTruthy();
        expect(screen.getByLabelText('コーチのライセンスNo.')).toBeTruthy();
        expect(screen.getByLabelText('Aコーチ')).toBeTruthy();
        expect(screen.getByLabelText('AコーチのライセンスNo.')).toBeTruthy();
    });

    it('編集画面の入力欄がすべてラベルと結び付いている', () => {
        seed([team()]);
        render(<OpponentManager onBack={vi.fn()} />);
        openEditor();

        expect(findUnlabeledFields()).toEqual([]);
    });
});

describe('OpponentManager: 画面構造', () => {
    it('mainランドマークとh1見出しを持つ', () => {
        seed([team()]);
        render(<OpponentManager onBack={vi.fn()} />);

        expect(document.querySelector('main')).toBeTruthy();
        expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    });
});
