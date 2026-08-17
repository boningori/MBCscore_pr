// 成長グラフのX軸ラベル。
//
// 年を落として「6月」「Q2」とだけ出していたため、シーズンをまたぐと
// 前年6月と今年6月が同じラベルで並び、どちらの棒がどちらか分からなかった
// （実測: 2025-06 と 2026-06 の2試合で xLabels が ["6月","6月"]）。
// ミニバスは学年をまたいで数年ぶん記録するので、複数年は例外ではない。

import { describe, it, expect } from 'vitest';
import { buildXLabels } from './chartXLabel';

describe('buildXLabels: 月単位', () => {
    it('同じ年のうちは月だけを出す（幅が狭いので冗長にしない）', () => {
        expect(buildXLabels(['2026年6月', '2026年7月', '2026年8月'], 'month'))
            .toEqual(['6月', '7月', '8月']);
    });

    it('年をまたぐと年を添えて区別できるようにする', () => {
        expect(buildXLabels(['2025年6月', '2026年6月', '2026年7月'], 'month'))
            .toEqual(["'25 6月", "'26 6月", "'26 7月"]);
    });
});

describe('buildXLabels: 四半期単位', () => {
    it('同じ年のうちは四半期だけを出す', () => {
        expect(buildXLabels(['2026年Q1', '2026年Q2'], 'quarter')).toEqual(['Q1', 'Q2']);
    });

    it('年をまたぐと年を添える', () => {
        expect(buildXLabels(['2025年Q2', '2026年Q2'], 'quarter'))
            .toEqual(["'25 Q2", "'26 Q2"]);
    });
});

describe('buildXLabels: 試合単位', () => {
    it('同じ年のうちは月日だけを出す', () => {
        expect(buildXLabels(['2026/01/15', '2026/06/01'], 'game')).toEqual(['1/15', '6/1']);
    });

    it('年をまたぐと年を添える（月日だけでは同じ日付が重なる）', () => {
        expect(buildXLabels(['2025/06/01', '2026/06/01'], 'game'))
            .toEqual(["'25 6/1", "'26 6/1"]);
    });
});

describe('buildXLabels: 年単位', () => {
    it('もともと年そのものなので重ねない', () => {
        expect(buildXLabels(['2025年', '2026年'], 'year')).toEqual(["'25", "'26"]);
    });
});

describe('buildXLabels: 読めない入力', () => {
    it('形が違うラベルはそのまま返す', () => {
        expect(buildXLabels(['なぞ'], 'month')).toEqual(['なぞ']);
    });

    it('年を読み取れないラベルが混ざっても、他のラベルの判定を壊さない', () => {
        expect(buildXLabels(['なぞ', '2025年6月', '2026年6月'], 'month'))
            .toEqual(['なぞ', "'25 6月", "'26 6月"]);
    });

    it('空配列は空配列', () => {
        expect(buildXLabels([], 'month')).toEqual([]);
    });
});
