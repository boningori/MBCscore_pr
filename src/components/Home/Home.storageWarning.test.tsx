// 保存領域が8割を超えたら、ホームにも帯を出す。
//
// 使用容量の可視化と8割超の警告は既にある（設定 → データ管理、eaafdd8）。
// ただしデータ管理の欄は折り畳みの中にあり、普段そこを開く用事は
// 「バックアップを取る」ときだけで、まさにその用事を思いつかない人に届かない。
// 開かないまま録り続けた人が最初に知るのは、試合が終わって保存を押した
// その瞬間になる。撤収しながら書き出して古い試合を選んで消すのは無理がある。
//
// 帯は閉じられない。放置すると記録が保存できなくなるので、8割を切るまで
// 出続ける。ボタンも付けない——「設定」も「試合履歴」もすぐ下のメニューに
// 並んでおり、重ねて出す理由がない。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { Home } from './Home';
import { LOCAL_STORAGE_LIMIT_BYTES, WARN_RATIO, estimateStorageUsage } from '../../utils/storageUsage';

const noop = vi.fn();

/** マイチームが無いとホームは「はじめに」の画面になり、メニューが出ない */
function seedTeam() {
    localStorage.setItem('minibasket-my-teams', JSON.stringify([{
        id: 't1', name: 'MBCジュニア', coachName: 'C', assistantCoachName: '',
        players: [], createdAt: '', updatedAt: '',
    }]));
}

function renderHome() {
    render(
        <Home
            onStartGame={noop}
            onManageTeams={noop}
            onViewHistory={noop}
            onManageOpponents={noop}
            onViewPlayerStats={noop}
            onOpenSettings={noop}
            isFullScreen={false}
            onToggleFullScreen={noop}
            isFullScreenSupported={false}
        />,
    );
}

/**
 * アプリのキーの合計がちょうど target バイトになるまで埋める。
 *
 * estimateStorageUsage を差し替えないのは、測る対象が localStorage
 * そのものだから。そこを模すと何も確かめたことにならない
 * （既存の storageUsage.test.ts も同じやり方）。
 */
function fillTo(target: number) {
    const KEY = 'minibasket-filler';
    localStorage.removeItem(KEY);
    const need = target - estimateStorageUsage().usedBytes - KEY.length;
    if (need < 0) throw new Error(`既に ${target} バイトを超えている`);
    localStorage.setItem(KEY, 'x'.repeat(need));
}

/** 8割ちょうど。既存の判定は `>` なので、ここでは出ない */
const EXACTLY_80 = LOCAL_STORAGE_LIMIT_BYTES * WARN_RATIO;
/** formatBytes が「4.2MB」を返す量（4.2 × 1024 × 1024 = 4,404,019.2） */
const OVER_80 = 4_404_019;

const BAND = /保存領域の空きが少なくなっています/;

beforeEach(() => {
    localStorage.clear();
    seedTeam();
});
afterEach(cleanup);

describe('保存領域の帯', () => {
    it('8割ちょうどでは出さない', () => {
        fillTo(EXACTLY_80);
        renderHome();
        expect(screen.queryByText(BAND)).toBeNull();
    });

    it('8割を超えたら、使用量が読める', () => {
        fillTo(OVER_80);
        renderHome();
        expect(screen.getByText(BAND)).toBeTruthy();
        expect(screen.getByText(/端末内の使用容量は 4\.2MB \/ 約5\.0MB です/)).toBeTruthy();
    });

    it('閉じるボタンが無い', () => {
        // 放置すると保存できなくなる。消したければ実際にデータを減らす
        fillTo(OVER_80);
        renderHome();
        const band = screen.getByText(BAND).closest('.storage-warning') as HTMLElement;
        expect(within(band).queryAllByRole('button')).toEqual([]);
    });

    it('帯が出ていても、いつもどおり試合を始められる', () => {
        fillTo(OVER_80);
        renderHome();
        expect(screen.getByRole('button', { name: /新規試合開始/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /試合履歴/ })).toBeTruthy();
    });
});
