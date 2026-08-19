// 成長グラフのX軸ラベル。
//
// 年を落として「6月」「Q2」とだけ出していたため、シーズンをまたぐと
// 前年6月と今年6月が同じラベルで並び、どちらの棒がどちらか分からなかった
// （実測: 2025-06 と 2026-06 の2試合で xLabels が ["6月","6月"]）。
// ミニバスは学年をまたいで数年ぶん記録するので、複数年は例外ではない。

import { describe, it, expect } from 'vitest';
import { buildXLabels, isExportLabelVisible, labelColumnWidth, labelStep } from './chartXLabel';

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

// 出力（PDF/JPEG）は幅827pxの1枚画像で、横スクロールで逃がせない。
// 列を縮めて全部の棒を入れると、こんどはラベルが重なって読めなくなるので
// ラベルだけ間引く。列を縮めなかったころは、収まらない棒がそのまま画像から
// 消えていた（実測: 20試合の選手で13本しか描かれず、新しい6試合が欠落）。
describe('labelStep', () => {
    it('全部が収まるなら間引かない', () => {
        expect(labelStep(10, 665, 46)).toBe(1);
    });

    it('収まらない分だけ間隔を空ける（20試合・出力幅665px・列46px）', () => {
        // 665 / 46 = 14枠 → 20ラベルを14枠に収めるので1つ飛ばし
        expect(labelStep(20, 665, 46)).toBe(2);
    });

    it('試合数が増えるほど間隔も広がる', () => {
        expect(labelStep(52, 665, 46)).toBe(4);
    });

    it('1つも入らない幅でも間隔は有限（0除算・無限ループにしない）', () => {
        expect(labelStep(100, 10, 46)).toBe(100);
    });

    it('ラベルが無い・幅が読めない場合は間引かない', () => {
        expect(labelStep(0, 665, 46)).toBe(1);
        expect(labelStep(20, 665, 0)).toBe(1);
    });
});

// 間引く向きは「最新から遡る」。先頭から数えると、最新の試合のラベルが
// 消える組み合わせが出る（20試合・1つ飛ばしで最後が偶数番目になる）。
// 成長を見る画面で右端＝直近が無名になるのはいちばん困る
describe('isExportLabelVisible', () => {
    it('間引かないときは全部出す', () => {
        expect([0, 1, 2].map(i => isExportLabelVisible(i, 3, 1))).toEqual([true, true, true]);
    });

    it('最新（最後）を必ず出し、そこから間隔ごとに遡る', () => {
        expect([0, 1, 2, 3, 4].map(i => isExportLabelVisible(i, 5, 2)))
            .toEqual([true, false, true, false, true]);
        expect([0, 1, 2, 3].map(i => isExportLabelVisible(i, 4, 2)))
            .toEqual([false, true, false, true]);
    });
});
