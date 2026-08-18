// 成長グラフのX軸ラベル。
//
// 軸は幅が狭いので、ふだんは年を落として「6月」「Q2」「6/1」とだけ出す。
// ただしシーズンをまたぐと前年6月と今年6月が同じラベルで並び、どちらの棒が
// どちらか分からなくなる（実測: 2025-06 と 2026-06 で ["6月","6月"]）。
// ミニバスは学年をまたいで数年ぶん記録するので、複数年は例外ではない。
// そこで「表示する範囲が年をまたぐときだけ」年を添える。
//
// 年は periodLabel（aggregateByPeriod が組み立てた表示名）から読む。
// PeriodStats の startDate はDateなので現地/UTCの読み違いが起きうるが、
// ラベルは記録された暦日から組まれているためそのまま使える（localDate.ts）。

import type { PeriodType } from '../../utils/playerStatsAnalysis';

/** "2026年6月" / "2026年Q1" / "2026年" / "2026/01/15" から西暦4桁を取り出す */
function labelYear(label: string): string | null {
    const matched = /(\d{4})/.exec(label);
    return matched ? matched[1] : null;
}

/** 2桁の年（'25）。軸に置けるいちばん短い形 */
function shortYear(year: string): string {
    return `'${year.slice(2)}`;
}

/** 年を除いた本体。読めない形はそのまま返す */
function withoutYear(label: string, periodType: PeriodType): string {
    switch (periodType) {
        case 'game': {
            // "2026/01/15" → "1/15"
            const parts = label.split('/');
            if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
            return label;
        }
        case 'month': {
            // "2026年1月" → "1月"
            const monthMatch = label.match(/(\d+)月/);
            return monthMatch ? `${monthMatch[1]}月` : label;
        }
        case 'quarter': {
            // "2026年1-3月" → "1-3月"（Q1 と書かない理由は getPeriodLabel）
            const rangeMatch = label.match(/(\d+-\d+月)/);
            if (rangeMatch) return rangeMatch[1];
            // 旧表記 "2026年Q1" も読めるようにしておく
            const qMatch = label.match(/(Q\d)/);
            return qMatch ? qMatch[1] : label;
        }
        case 'year': {
            // "2026年" → "'26"
            const yearMatch = label.match(/(\d{4})年/);
            return yearMatch ? shortYear(yearMatch[1]) : label;
        }
    }
}

/**
 * 期間ラベルの並びを、X軸に置く短い表記へ変換する。
 *
 * 年をまたぐときだけ年を添える。年単位はラベル自体が年なので何もしない。
 */
export function buildXLabels(periodLabels: string[], periodType: PeriodType): string[] {
    const bodies = periodLabels.map(label => withoutYear(label, periodType));
    if (periodType === 'year') return bodies;

    const years = periodLabels.map(labelYear);
    // 年を読めなかったラベルは判定に混ぜない（1つ壊れているだけで全部に年が付く）
    const known = new Set(years.filter((y): y is string => y !== null));
    if (known.size <= 1) return bodies;

    return bodies.map((body, i) => {
        const year = years[i];
        return year ? `${shortYear(year)} ${body}` : body;
    });
}
