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
}));

// getStoredApiKey は geminiClient に移動済み。実装のままだと localStorage / env
// を読みに行ってしまうため、決定的な空文字を返すスタブに固定する。
vi.mock('../../utils/geminiClient', () => ({
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

describe('OpponentManager: 名前で探す', () => {
    const seedThree = () => seed([
        team({ id: 'opp-1', name: '西陵ミニバス' }),
        team({ id: 'opp-2', name: '東陵ミニバスケットボールクラブ' }),
        team({ id: 'opp-3', name: 'MBC Jr' }),
    ]);

    const searchBox = () => screen.getByLabelText('検索：');

    it('入力すると名前で絞られる', () => {
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);

        fireEvent.change(searchBox(), { target: { value: '西陵' } });

        expect(screen.getByText('西陵ミニバス')).toBeTruthy();
        expect(screen.queryByText('東陵ミニバスケットボールクラブ')).toBeNull();
        expect(screen.queryByText('MBC Jr')).toBeNull();
    });

    it('✕ を押すと全件に戻る', () => {
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);
        fireEvent.change(searchBox(), { target: { value: '西陵' } });

        fireEvent.click(screen.getByRole('button', { name: '検索条件を消す' }));

        expect(screen.getByText('東陵ミニバスケットボールクラブ')).toBeTruthy();
        expect(screen.getByText('MBC Jr')).toBeTruthy();
    });

    it('件数を「n / m件」で示す', () => {
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);
        expect(screen.getByText('3 / 3件')).toBeTruthy();

        fireEvent.change(searchBox(), { target: { value: 'ミニバス' } });

        expect(screen.getByText('2 / 3件')).toBeTruthy();
    });

    it('検索で0件になったときは、登録が無いときと違う文面を出す', () => {
        // 「そもそも登録が無い」と「検索で消えた」を同じ文面にすると、
        // 事実と違う案内になる
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);

        fireEvent.change(searchBox(), { target: { value: '該当なし' } });

        expect(screen.getByText('「該当なし」に一致するチームはありません')).toBeTruthy();
        expect(screen.queryByText('登録された対戦チームはありません')).toBeNull();
    });

    it('0件になっても検索窓と ✕ は消えない', () => {
        // 条件を変える手段が消えると、その条件から抜け出せなくなる
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);

        fireEvent.change(searchBox(), { target: { value: '該当なし' } });

        expect(searchBox()).toBeTruthy();
        expect(screen.getByRole('button', { name: '検索条件を消す' })).toBeTruthy();
    });

    it('登録が1件も無いときは検索窓を出さない', () => {
        seed([]);
        render(<OpponentManager onBack={vi.fn()} />);

        expect(screen.queryByLabelText('検索：')).toBeNull();
        expect(screen.getByText('登録された対戦チームはありません')).toBeTruthy();
    });

    it('検索窓にもラベルが結び付いている', () => {
        // 読み上げで何の入力欄か分かり、ラベルのタップでフォーカスが移る
        seedThree();
        render(<OpponentManager onBack={vi.fn()} />);

        expect(findUnlabeledFields()).toEqual([]);
    });
});
