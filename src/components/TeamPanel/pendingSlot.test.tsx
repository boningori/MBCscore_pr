// 保留アクションの置き場所。
//
// 以前は画面下端に固定して浮かせていた。「下端はアクション履歴の末尾で、
// 隠れても影響が最も少ない」という前提だったが、履歴は新しい順に並ぶので
// （ActionHistory）そこにあるのは「いま記録した1件」である。しかもパネルの
// 縦の配分は画面の高さで決まり、実測(v1.6.15・本番ビルド・1024x768)では
// 履歴の一覧が41px＝1行だけになって、バッジ(y712-756)がその行(y707-747)に
// 重なっていた。行の背番号の位置を叩くと当たるのはバッジのほうで、
// 長押しの訂正もできない。
//
// ヘッダーのチップ列（TF・タイムアウトと同じ「このチームの状態」）へ移して
// 重なりを無くした。ここではその置き場所を固定する。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TeamPanel } from './TeamPanel';
import { PendingActionPanel } from '../PendingActionPanel';
import { createPlayer } from '../../types/game';
import { createPendingAction } from '../../types/pendingAction';

afterEach(cleanup);

const noopHandlers = {
    onRemoveScore: vi.fn(),
    onRemoveStat: vi.fn(),
    onRemoveFoul: vi.fn(),
    onEditScore: vi.fn(),
    onEditStat: vi.fn(),
    onEditFoul: vi.fn(),
    onEditFoulFreeThrows: vi.fn(),
    onConvertScoreToMiss: vi.fn(),
    onConvertMissToScore: vi.fn(),
    onToggleOwnGoal: vi.fn(),
};

const player = { ...createPlayer('a1', 4, '選手4', true), isOnCourt: true };

function renderWithPending(pendingSlot?: React.ReactNode) {
    render(
        <TeamPanel
            teamId="teamA"
            teamName="ホーム"
            teamColor="white"
            players={[player]}
            isActive={false}
            selectedPlayerId={null}
            gameMode="full"
            scoreHistory={[]}
            statHistory={[]}
            foulHistory={[]}
            onPlayerSelect={vi.fn()}
            onSubstitute={vi.fn()}
            onCoachFoul={vi.fn()}
            actionHistoryHandlers={noopHandlers}
            teamFouls={0}
            pendingSlot={pendingSlot}
        />,
    );
}

function pendingPanel() {
    const pending = createPendingAction('STAT', 'OREB', 'teamA', 1, [
        { id: 'a1', number: 4, name: '選手4' },
    ]);
    return (
        <PendingActionPanel
            pendingActions={[pending]}
            onResolveUnknown={vi.fn()}
            onRemove={vi.fn()}
            onDirectResolve={vi.fn()}
        />
    );
}

describe('TeamPanel: 保留アクションの置き場所', () => {
    it('保留バッジはヘッダーのチップ列に入る（アクション履歴に重ならない）', () => {
        renderWithPending(pendingPanel());

        const badge = screen.getByRole('button', { name: /保留/ });
        // TF・タイムアウトと同じ器。ここに入っている＝履歴の上に浮かない
        expect(badge.closest('.team-panel-status')).not.toBeNull();
        expect(badge.closest('.action-history')).toBeNull();
    });

    it('展開したパネルの位置指定に使う「側」が器に付く', () => {
        renderWithPending(pendingPanel());

        const slot = screen.getByRole('button', { name: /保留/ }).closest('.pending-slot');
        expect(slot).not.toBeNull();
        expect(slot!.className).toContain('pending-slot-team-a');
    });

    it('保留が無ければ器ごと出さない', () => {
        renderWithPending(undefined);

        expect(document.querySelector('.pending-slot')).toBeNull();
        expect(screen.queryByRole('button', { name: /保留/ })).toBeNull();
    });

    // 「保留」の文字はヘッダーの幅が足りないためCSSで落とす（App.css）。
    // 読み上げ名まで絵文字と数字だけにしないよう、ボタン側で名前を持つ
    it('バッジの読み上げ名は件数と目的まで含む', () => {
        renderWithPending(pendingPanel());

        expect(screen.getByRole('button', { name: '保留 1件 選手を割り当てる' })).toBeTruthy();
    });
});
