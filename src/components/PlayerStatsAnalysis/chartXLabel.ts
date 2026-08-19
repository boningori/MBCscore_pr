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

// X軸ラベル1つぶんの列幅（px）。
//
// 列幅はバー幅と同じ20px固定で、ラベルは overflow:hidden だった。年をまたぐと
// 年を添える（'25 11月）のに、その年が入った瞬間に枠から溢れて「'2…」と
// 省略される —— 年を添えた意味がそこで消えていた（実測: '25 11月 は37px、
// '26 10-12月 は51px、枠は20px）。バー本体は .bar-track の max-width:24px で
// 止まるので、列を広げても棒は太らない。溢れる分は chart-scroll-area が横に
// スクロールする。
const CHAR_WIDTH_DIGIT = 5.4;   // 10px フォントでの数字（実測 "2026"=21.6px）
const CHAR_WIDTH_NARROW = 3.2;  // ' - / と空白
const CHAR_WIDTH_WIDE = 10;     // 「月」などの全角
const LABEL_PADDING = 4;
/** バー幅。ラベルが短くてもここより狭くしない */
const MIN_COLUMN_WIDTH = 20;

/** 並びの中でいちばん長いラベルが収まる列幅を返す */
export function labelColumnWidth(labels: string[]): number {
    let widest = 0;
    for (const label of labels) {
        let width = 0;
        for (const char of label) {
            const code = char.codePointAt(0) ?? 0;
            width += code > 0xff ? CHAR_WIDTH_WIDE
                : char >= '0' && char <= '9' ? CHAR_WIDTH_DIGIT
                    : CHAR_WIDTH_NARROW;
        }
        if (width > widest) widest = width;
    }
    return Math.max(MIN_COLUMN_WIDTH, Math.ceil(widest + LABEL_PADDING));
}

// 出力（PDF/JPEG）のX軸ラベルの間引き。
//
// 出力は幅827pxの1枚画像で、画面のように横スクロールで逃がせない。列幅を
// 固定したままだと収まらない棒が枠の外へ出て、そのまま画像から消えていた
// （実測: 20試合の選手で13本しか描かれず、新しい6試合が欠落）。
// 出力時は列を縮めて全部の棒を入れる（CSSの min-width:0）ぶん、こんどは
// ラベルが重なるので、ラベルだけ間引いて読めるようにする。
//
// 間引きをJS側で決められるのは、出力幅が固定だから。html2canvas は生きた
// DOMを複製して windowWidth の枠で描き直すので、レイアウトはCSSが追随するが
// JSは走らない。幅が可変な画面の側で同じことをするなら別の仕組みが要る。

/** 出力時にX軸ラベルへ使える幅(px)。827px・1列での実測値（y軸36pxと余白を除いた分） */
export const EXPORT_PLOT_WIDTH = 665;

/**
 * ラベルを availableWidth に収めるための表示間隔（1なら全部出す）。
 *
 * @param count ラベルの総数
 * @param availableWidth 軸に使える幅(px)
 * @param labelWidth ラベル1つに要る幅(px)。labelColumnWidth の戻り値
 */
export function labelStep(count: number, availableWidth: number, labelWidth: number): number {
    if (count <= 0 || labelWidth <= 0) return 1;
    // 1つも入らない幅でも最低1つは入るものとして扱う（0除算にしない）
    const fits = Math.max(1, Math.floor(availableWidth / labelWidth));
    if (count <= fits) return 1;
    return Math.ceil(count / fits);
}

/**
 * 出力でこの位置のラベルを出すか。
 *
 * 数えるのは最後（＝いちばん新しい期間）から。先頭から数えると、総数と間隔の
 * 組み合わせ次第で右端のラベルが消える。成長を見るグラフで直近が無名になるのは
 * いちばん困るので、最新を固定して遡る。
 */
export function isExportLabelVisible(index: number, count: number, step: number): boolean {
    if (step <= 1) return true;
    return (count - 1 - index) % step === 0;
}
