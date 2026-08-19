// 統合の解除。
//
// 統合は集計時の名寄せで試合記録を書き換えないため、解除は対応表から項目を
// 消すだけで元の枚数に戻る。間違えて統合しても取り返しがつく、という前提を
// 画面にも出しておく。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { makeAggregatedPlayer } from '../../test/statsFactories';
import { DetailView } from './DetailView';

vi.mock('../../utils/pdfExport', () => ({ exportElement: vi.fn() }));

afterEach(cleanup);

const player = makeAggregatedPlayer({ playerKey: '佐藤 太郎', name: '佐藤 太郎', gamesPlayed: 2 });

describe('DetailView: 統合の解除', () => {
    it('統合済みなら解除の操作子が出る', () => {
        render(
            <DetailView
                player={player} teamId="t1" isHidden={false} onToggleHidden={() => { }}
                isMerged onUnmerge={() => { }}
            />,
        );

        expect(screen.getByRole('button', { name: '統合を解除' })).toBeTruthy();
    });

    it('統合していなければ出ない', () => {
        render(
            <DetailView
                player={player} teamId="t1" isHidden={false} onToggleHidden={() => { }}
                isMerged={false} onUnmerge={() => { }}
            />,
        );

        expect(screen.queryByRole('button', { name: '統合を解除' })).toBeNull();
    });

    it('押すと解除が呼ばれる', () => {
        const onUnmerge = vi.fn();
        render(
            <DetailView
                player={player} teamId="t1" isHidden={false} onToggleHidden={() => { }}
                isMerged onUnmerge={onUnmerge}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '統合を解除' }));

        expect(onUnmerge).toHaveBeenCalledTimes(1);
    });
});
