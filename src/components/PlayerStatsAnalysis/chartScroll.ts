// 成長グラフの横スクロール位置。
//
// 期間の数が増えると軸は枠に収まらず横スクロールになる（列幅はX軸ラベルに
// 合わせて決まる。詳細は chartXLabel）。そこには2つ問題があった:
//
//  - 初期位置が左端＝いちばん古い期間。20試合の選手をタブレット(768px)で
//    開くと、1枚あたり5試合ぶんしか見えず、そこに出るのは最初の5試合
//    （実測: 枠258px／中身962px）。直近の調子を見る画面で直近が隠れている。
//  - 6枚のグラフが別々にスクロールする。得点とリバウンドで同じ横位置が
//    別の期間を指すので、並べて比べられない。
//
// 出力（PDF/JPEG）側は横スクロールで逃がせないため、別の手当てをしている
// （列を縮めて全部入れ、ラベルを間引く。chartXLabel の labelStep）。

/** 横スクロールする軸。DOM要素でもテスト用の擬似要素でも受けられる最小の形 */
export interface ScrollableAxis {
    scrollLeft: number;
    readonly scrollWidth: number;
    readonly clientWidth: number;
}

/** いちばん新しい期間が見える右端へ寄せる */
export function scrollToLatest(axis: ScrollableAxis | null): void {
    if (!axis) return;
    // 全部収まっているときは 0。負の位置を作らない
    axis.scrollLeft = Math.max(0, axis.scrollWidth - axis.clientWidth);
}

/**
 * 動かした1枚に合わせて残りの軸をそろえる。
 *
 * 同じ位置なら書き込まない。書くと scroll イベントが飛び、そのイベントが
 * また同期を呼ぶため、往復が止まらなくなる。
 */
export function syncScrollLeft(source: ScrollableAxis, all: Iterable<ScrollableAxis | null>): void {
    for (const axis of all) {
        if (!axis || axis === source) continue;
        if (axis.scrollLeft === source.scrollLeft) continue;
        axis.scrollLeft = source.scrollLeft;
    }
}
