// 成長グラフは試合数が増えても全部を見せなければならない。
//
// 列幅をラベルに合わせて固定し、あふれた分を横スクロールに逃がしていたため:
//  - 出力（PDF/JPEG）は幅827pxの1枚画像で逃がす先が無く、枠外の棒がそのまま
//    消えていた（実測: 20試合の選手のJPEGに13本しか描かれず、新しい6試合が欠落）
//  - 画面は初期位置が左端＝いちばん古い期間。タブレット(768px)で20試合を開くと
//    1枚あたり5試合ぶんしか見えず、そこに出るのは最初の5試合
//  - 6枚のグラフが別々にスクロールし、同じ横位置が別の期間を指していた

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { act } from 'react';
import { makeGameRecord, makeStats } from '../../test/statsFactories';
import { GrowthComparison } from './GrowthComparison';

afterEach(cleanup);

/** 2シーズンにまたがる n 試合（年を添えたラベルになるので列が広くなる） */
function manyGames(n: number) {
    return Array.from({ length: n }, (_, i) => {
        const year = i < n / 2 ? 2025 : 2026;
        const month = (i % 12) + 1;
        return makeGameRecord({
            gameId: 'g' + i,
            date: `${year}-${String(month).padStart(2, '0')}-05T00:00:00.000Z`,
            stats: makeStats({ points: i }),
        });
        // gameHistory は日付降順で渡ってくる（aggregatePlayerStats）
    }).reverse();
}

const labelsOf = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.x-label')];
const axesOf = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.chart-scroll-area')];

/** jsdom は実レイアウトを持たないので、スクロールできる状態を作る */
function makeScrollable(el: HTMLElement, scrollWidth: number, clientWidth: number) {
    Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
    let left = 0;
    Object.defineProperty(el, 'scrollLeft', {
        configurable: true,
        get: () => left,
        set: (v: number) => { left = v; },
    });
}

describe('出力時のX軸ラベルの間引き', () => {
    it('全部が収まる試合数なら1つも隠さない', () => {
        const { container } = render(<GrowthComparison gameHistory={manyGames(6)} />);
        const labels = labelsOf(container).slice(0, 6);

        expect(labels).toHaveLength(6);
        for (const label of labels) {
            expect(label.style.getPropertyValue('--export-label-vis')).toBe('visible');
        }
    });

    it('収まらない試合数では間引き、右端（最新）は必ず残す', () => {
        const { container } = render(<GrowthComparison gameHistory={manyGames(20)} />);
        // 1枚目のグラフぶんだけ見る
        const labels = labelsOf(container).slice(0, 20);
        const shown = labels.map(l => l.style.getPropertyValue('--export-label-vis'));

        expect(labels).toHaveLength(20);
        expect(shown).toContain('hidden');
        expect(shown[19]).toBe('visible');
        expect(shown[18]).toBe('hidden');
    });
});

describe('画面のスクロール位置', () => {
    it('いちばん新しい期間が見える位置から始める', () => {
        const { container } = render(<GrowthComparison gameHistory={manyGames(20)} />);
        const axes = axesOf(container);
        axes.forEach(axis => makeScrollable(axis, 962, 258));

        // レイアウトが決まったあと（＝スクロール量が測れるようになったあと）に寄せ直す
        act(() => { fireEvent(window, new Event('resize')); });

        expect(axes).toHaveLength(6);
        for (const axis of axes) {
            expect(axis.scrollLeft).toBe(962 - 258);
        }
    });

    it('1枚を動かすと残りの5枚も同じ位置にそろう', () => {
        const { container } = render(<GrowthComparison gameHistory={manyGames(20)} />);
        const axes = axesOf(container);
        axes.forEach(axis => makeScrollable(axis, 962, 258));

        axes[0].scrollLeft = 300;
        act(() => { fireEvent.scroll(axes[0]); });

        for (const axis of axes) {
            expect(axis.scrollLeft).toBe(300);
        }
    });
});
