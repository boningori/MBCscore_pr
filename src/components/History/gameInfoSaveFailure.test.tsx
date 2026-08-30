// 履歴から試合情報・終了時間を直したとき、保存に失敗したら画面もそう見せること。
//
// 更新関数の戻り値を捨てていたため、localStorage に書けていなくても
// applyRecordUpdate がメモリ上の複製だけ更新していた。画面には入力が
// 反映されたまま残り、利用者は保存できたと思うが、再読み込みすると消える。
// 端末の空き容量が尽きた状態（このアプリは全部を端末内に置くので現実に起きる）で
// 記録が失われていることに気づけない、という一番まずい形になる。
//
// 画面と保存内容を必ず一致させ、失敗はトーストで知らせる。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { History } from './History';
import { showToast } from '../Toast/toastApi';
import { loadGameRecord } from '../../utils/gameHistoryStorage';

vi.mock('../Toast/toastApi', () => ({ showToast: vi.fn() }));

const GAME_ID = 'g1';

function seed() {
    const team = (id: string, name: string, color: 'white' | 'blue') => ({
        id, name, coachName: 'コーチ', assistantCoachName: '', color,
        players: [], timeouts: [], teamFouls: [0, 0, 0, 0],
        coachFouls: [], assistantCoachFouls: [], benchFouls: [],
    });
    localStorage.setItem('minibasket-game-history', JSON.stringify([{
        id: GAME_ID, date: new Date(Date.UTC(2026, 3, 10)).toISOString(), gameName: '第1節',
        teamA: team('teamA', '6年生チーム', 'white'), teamB: team('teamB', '相手', 'blue'),
        finalScore: { teamA: 0, teamB: 0 },
        scoreHistory: [], statHistory: [], foulHistory: [],
        gameInfo: {
            venue: '市民体育館', time: '', gameNo: '', crewChief: '', umpire: '',
            scorer: '', assistantScorer: '', timer: '', shotClockOperator: '',
        },
        quarterMinutes: 6, showThreePoint: false, createdAt: new Date().toISOString(),
    }]));
}

function openGameInfoModal() {
    fireEvent.click(document.querySelector('.history-card-main') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'スコアシート（保存/PDF）' }));
    fireEvent.click(screen.getByRole('button', { name: '試合情報編集' }));
}

/** localStorage への書き込みを失敗させる（seed のあとに呼ぶこと） */
function failStorageWrites() {
    vi.spyOn(console, 'error').mockImplementation(() => { });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
    });
}

const errorToasts = () =>
    vi.mocked(showToast).mock.calls.filter(([, type]) => type === 'error');

beforeEach(() => {
    localStorage.clear();
    seed();
    vi.mocked(showToast).mockClear();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('履歴の後編集: 保存に失敗したとき', () => {
    it('試合情報が保存できなければ、画面も元のままにする', () => {
        render(<History onBack={() => { }} />);
        openGameInfoModal();
        failStorageWrites();

        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '中央体育館' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        vi.restoreAllMocks();

        // 保存されていないので、開き直すと元の会場のまま
        fireEvent.click(screen.getByRole('button', { name: '試合情報編集' }));
        expect((screen.getByLabelText('会場') as HTMLInputElement).value).toBe('市民体育館');
        expect(loadGameRecord(GAME_ID)?.gameInfo?.venue).toBe('市民体育館');
    });

    it('試合情報が保存できなければ、そう知らせる', () => {
        render(<History onBack={() => { }} />);
        openGameInfoModal();
        failStorageWrites();

        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '中央体育館' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(errorToasts().length).toBeGreaterThan(0);
        expect(errorToasts()[0][0]).toContain('保存できませんでした');
    });

    it('終了時間が保存できなければ、画面も元のままにする', () => {
        render(<History onBack={() => { }} />);
        openGameInfoModal();
        failStorageWrites();

        fireEvent.change(screen.getByLabelText('終了時間'), { target: { value: '11:45' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
        vi.restoreAllMocks();

        // endTime を持たない記録は createdAt の時刻を出す（旧レコード向けの既定）。
        // 見たいのは「保存できなかった入力が反映されていないこと」
        fireEvent.click(screen.getByRole('button', { name: '試合情報編集' }));
        expect((screen.getByLabelText('終了時間') as HTMLInputElement).value).not.toBe('11:45');
        expect(loadGameRecord(GAME_ID)?.endTime).toBeUndefined();
    });

    it('保存できたときは知らせない（毎回エラーを出さない）', () => {
        render(<History onBack={() => { }} />);
        openGameInfoModal();

        fireEvent.change(screen.getByLabelText('会場'), { target: { value: '中央体育館' } });
        fireEvent.click(screen.getByRole('button', { name: '保存' }));

        expect(errorToasts()).toHaveLength(0);
        expect(loadGameRecord(GAME_ID)?.gameInfo?.venue).toBe('中央体育館');
    });
});
