import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MyTeamManager } from './MyTeamManager';
import { loadMyTeams } from '../../utils/teamStorage';
import type { SavedTeam } from '../../utils/teamStorage';
import { findUnlabeledFields } from '../../test/accessibleNames';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../Toast/toastApi', () => ({ showToast }));

function team(overrides: Partial<SavedTeam> = {}): SavedTeam {
    return {
        id: 'team-1',
        name: '港南ミニバス',
        coachName: '山田',
        assistantCoachName: '',
        players: [4, 5, 6, 7, 8].map(n => ({
            number: n, bibNumber: n, uniformNumber: n + 10,
            name: `選手${n}`, isCaptain: n === 4,
        })),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function seed(teams: SavedTeam[]) {
    localStorage.setItem('minibasket-my-teams', JSON.stringify(teams));
}

/** 一覧から「編集」を開く */
function openEditor() {
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
}

beforeEach(() => {
    localStorage.clear();
    showToast.mockReset();
});

afterEach(cleanup);

describe('MyTeamManager: 一覧', () => {
    it('登録済みチームを人数とコーチ名つきで並べる', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);

        expect(screen.getByText('港南ミニバス')).toBeTruthy();
        expect(screen.getByText(/5名/)).toBeTruthy();
        expect(screen.getByText(/山田/)).toBeTruthy();
    });

    it('1件も無ければ新規作成へ誘導する', () => {
        render(<MyTeamManager onBack={vi.fn()} />);
        expect(screen.getByRole('button', { name: /新規チーム作成/ })).toBeTruthy();
    });

    it('戻るで onBack を呼ぶ', () => {
        const onBack = vi.fn();
        render(<MyTeamManager onBack={onBack} />);
        fireEvent.click(screen.getByRole('button', { name: '← 戻る' }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });
});

describe('MyTeamManager: 削除', () => {
    it('確認してから消す', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: '削除' }));
        // 確認前は消えない
        expect(loadMyTeams()).toHaveLength(1);

        const dialog = screen.getByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

        expect(loadMyTeams()).toHaveLength(0);
    });

    it('キャンセルすれば残る', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: '削除' }));
        const dialog = screen.getByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

        expect(loadMyTeams()).toHaveLength(1);
    });
});

describe('MyTeamManager: 編集と保存', () => {
    it('5人未満では保存できない（コート上の人数を満たせないため）', () => {
        seed([team({ players: team().players.slice(0, 4) })]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('5人以上なら保存でき、localStorageに反映される', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('チーム名 *'), { target: { value: '港南ミニバスB' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        const saved = loadMyTeams();
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('港南ミニバスB');
        // 一覧に戻る
        expect(screen.getByRole('button', { name: /新規チーム作成/ })).toBeTruthy();
    });

    it('チーム名が空だと保存できない', () => {
        seed([team({ name: '' })]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('キャンセルすると変更は保存されない', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('チーム名 *'), { target: { value: '書き換え' } });
        fireEvent.click(screen.getByRole('button', { name: '← キャンセル' }));

        expect(loadMyTeams()[0].name).toBe('港南ミニバス');
    });
});

describe('MyTeamManager: 選手の追加', () => {
    it('ビブス番号が重複したら知らせて追加しない', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('ビブス番号'), { target: { value: '4' } });
        fireEvent.change(screen.getByLabelText('選手名'), { target: { value: '重複くん' } });
        fireEvent.click(screen.getByRole('button', { name: '追加' }));

        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('既に登録されています'), 'error');
        expect(screen.queryByText('重複くん')).toBeNull();
    });

    it('未入力のうちは「追加」ボタンが押せない（何が足りないかは欄を見れば分かる）', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        const add = () => screen.getByRole('button', { name: '追加' }) as HTMLButtonElement;
        expect(add().disabled).toBe(true);

        fireEvent.change(screen.getByLabelText('選手名'), { target: { value: '番号なし' } });
        expect(add().disabled).toBe(true);

        fireEvent.change(screen.getByLabelText('ビブス番号'), { target: { value: '9' } });
        expect(add().disabled).toBe(false);
    });

    // ライセンスNo.欄のEnterは handleAddPlayer を直接呼ぶため、
    // disabledなボタンを迂回して未入力のまま実行されうる。
    // 以前はそこで無言でreturnしていた（押しても何も起きない）
    it('入力が足りないままEnterを押したら、何が足りないかを知らせる', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('ビブス番号'), { target: { value: '9' } });
        fireEvent.keyDown(screen.getByLabelText('選手のライセンスNo.'), { key: 'Enter' });

        expect(showToast).toHaveBeenCalledWith('氏名を入力してください', 'error');
    });

    it('番号が無いままEnterを押したときも知らせる', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('選手名'), { target: { value: '番号なし' } });
        fireEvent.keyDown(screen.getByLabelText('選手のライセンスNo.'), { key: 'Enter' });

        expect(showToast).toHaveBeenCalledWith(
            'ビブス番号またはユニフォーム番号のいずれかを入力してください', 'error');
        expect(screen.queryByText('番号なし')).toBeNull();
    });

    it('空いている番号なら追加できる', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        fireEvent.change(screen.getByLabelText('ビブス番号'), { target: { value: '9' } });
        fireEvent.change(screen.getByLabelText('選手名'), { target: { value: '新入り' } });
        fireEvent.click(screen.getByRole('button', { name: '追加' }));

        expect(screen.getByText('新入り')).toBeTruthy();
    });
});

describe('MyTeamManager: 選択モード（試合設定から呼ばれる経路）', () => {
    it('チームを選ぶと onSelectTeam に渡す', () => {
        const onSelectTeam = vi.fn();
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} onSelectTeam={onSelectTeam} isSelectionMode />);

        fireEvent.click(screen.getByRole('button', { name: '選択' }));

        expect(onSelectTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 'team-1' }));
    });
});

describe('MyTeamManager: アクセシビリティ', () => {
    it('編集画面の入力欄がすべてラベルと結び付いている', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);
        openEditor();

        expect(findUnlabeledFields()).toEqual([]);
    });

    it('画面はmainランドマークと見出しを持つ', () => {
        seed([team()]);
        render(<MyTeamManager onBack={vi.fn()} />);

        expect(document.querySelector('main')).toBeTruthy();
        expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('マイチーム管理');
    });
});
