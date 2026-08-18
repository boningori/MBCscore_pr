// 成長グラフのX軸ラベル。
//
// 年を落として「6月」「Q2」とだけ出していたため、シーズンをまたぐと
// 前年6月と今年6月が同じラベルで並び、どちらの棒がどちらか分からなかった
// （実測: 2025-06 と 2026-06 の2試合で xLabels が ["6月","6月"]）。
// ミニバスは学年をまたいで数年ぶん記録するので、複数年は例外ではない。

import { describe, it, expect } from 'vitest';
import { buildXLabels, labelColumnWidth } from './chartXLabel';

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
    it('同じ年のうちは月の範囲だけを出す', () => {
        expect(buildXLabels(['2026年1-3月', '2026年4-6月'], 'quarter')).toEqual(['1-3月', '4-6月']);
    });

    it('年をまたぐと年を添える', () => {
        expect(buildXLabels(['2025年4-6月', '2026年4-6月'], 'quarter'))
            .toEqual(["'25 4-6月", "'26 4-6月"]);
    });

    it('2桁の月（10-12月）も年と取り違えずに切り出せる', () => {
        expect(buildXLabels(['2026年10-12月'], 'quarter')).toEqual(['10-12月']);
    });

    // 「Q1」は試合のクォーターと紛らわしいので使わなくなったが、
    // 表記を変える前に作られたラベルが渡っても軸が壊れないようにしておく
    it('旧表記のQ1も読める', () => {
        expect(buildXLabels(['2026年Q1', '2026年Q2'], 'quarter')).toEqual(['Q1', 'Q2']);
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

// 列幅はバー幅と同じ20px固定で、ラベルは overflow:hidden だった。年をまたぐと
// 年を添えるのに、その年が入った瞬間に枠から溢れて省略される —— 年を添えた
// 意味がそこで消えていた（実測: 「'25 11月」は37px、「'26 10-12月」は51px、枠は20px）。
describe('labelColumnWidth', () => {
    it('短いラベルではバー幅(20px)のまま', () => {
        expect(labelColumnWidth(['6/1', '7/5'])).toBe(20);
        expect(labelColumnWidth(["'25", "'26"])).toBe(20);
    });

    it('年を添えたラベルが収まる幅まで広げる', () => {
        // 実測 30.5px（10px フォント）
        expect(labelColumnWidth(["'25 6/1", "'26 6/1"])).toBeGreaterThanOrEqual(31);
    });

    it('いちばん長いラベルに合わせる（並びの中で幅をそろえる）', () => {
        const widths = labelColumnWidth(["'26 1-3月", "'25 10-12月"]);
        // 実測 51.4px
        expect(widths).toBeGreaterThanOrEqual(52);
        // 余らせすぎない（画面が無駄に横スクロールになる）
        expect(widths).toBeLessThanOrEqual(64);
    });

    it('ラベルが無ければバー幅のまま', () => {
        expect(labelColumnWidth([])).toBe(20);
    });
});
