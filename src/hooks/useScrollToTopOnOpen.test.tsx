// 画面・サブビューを開いたときのスクロール位置。
//
// URLルーティングを持たないので、画面を差し替えても前の位置が残る。
// 実測(v1.6.15・本番ビルド・375x812): 選手一覧を最下部(1902px)まで
// スクロールして最後の選手カードを押すと、詳細が1902pxのまま開き、
// 選手名も「← 一覧」も画面外にあった。

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useScrollToTopOnOpen } from './useScrollToTopOnOpen';

afterEach(() => {
    cleanup();
    scroller().scrollTop = 0;
});

function scroller(): Element {
    return document.scrollingElement ?? document.documentElement;
}

function Harness({ viewKey }: { viewKey: string | null }) {
    useScrollToTopOnOpen(viewKey);
    return null;
}

describe('useScrollToTopOnOpen', () => {
    it('サブビューを開いたら先頭へ戻す', () => {
        const { rerender } = render(<Harness viewKey={null} />);
        scroller().scrollTop = 1902;

        rerender(<Harness viewKey="player-1" />);

        expect(scroller().scrollTop).toBe(0);
    });

    it('一覧へ戻るときは位置を保つ（見ていた行を探し直さずに済む）', () => {
        const { rerender } = render(<Harness viewKey="player-1" />);
        scroller().scrollTop = 1902;

        rerender(<Harness viewKey={null} />);

        expect(scroller().scrollTop).toBe(1902);
    });

    it('別のサブビューへ移ったら先頭へ戻す', () => {
        const { rerender } = render(<Harness viewKey="game-1" />);
        scroller().scrollTop = 800;

        rerender(<Harness viewKey="game-2" />);

        expect(scroller().scrollTop).toBe(0);
    });

    // 同じ画面のまま再描画されるのは記録のたびに起きる。
    // そこで先頭へ飛ばすと、読んでいる途中の一覧が勝手に巻き戻る
    it('同じキーのまま再描画しても動かさない', () => {
        const { rerender } = render(<Harness viewKey="stats" />);
        scroller().scrollTop = 400;

        rerender(<Harness viewKey="stats" />);

        expect(scroller().scrollTop).toBe(400);
    });

    // マウント時点の位置は前の画面から引き継いだものではない
    // （画面側が既に先頭にいる、復元直後、など）
    it('初回マウントでは動かさない', () => {
        scroller().scrollTop = 300;

        render(<Harness viewKey="home" />);

        expect(scroller().scrollTop).toBe(300);
    });
});
