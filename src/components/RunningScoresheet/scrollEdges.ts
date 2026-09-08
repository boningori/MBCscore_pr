// 横スクロールする枠の、どちら側に続きが隠れているか。
// 判定の理由と境界は scrollEdges.test.ts に書いてある。

/** 横スクロールする枠。DOM要素でもテスト用の擬似要素でも受けられる最小の形 */
export interface ScrollableBox {
    readonly scrollLeft: number;
    readonly scrollWidth: number;
    readonly clientWidth: number;
}

/** どちら側に続きが隠れているか */
export interface ScrollEdges {
    left: boolean;
    right: boolean;
}

/**
 * 端の判定に使う許容幅（px）。
 *
 * 幅は mm 指定（210mm）から小数で決まるため、右端まで寄せても
 * scrollLeft + clientWidth が scrollWidth にちょうど一致しないことがある。
 * 1px未満のずれで「まだ右に続く」と出ると、目印が消えないまま残る。
 */
const EDGE_TOLERANCE_PX = 1;

/** 枠の現在位置から、続きが隠れている側を返す（枠が無ければどちらも false） */
export function scrollEdges(box: ScrollableBox | null | undefined): ScrollEdges {
    if (!box) return { left: false, right: false };

    const maxScrollLeft = box.scrollWidth - box.clientWidth;
    if (maxScrollLeft <= EDGE_TOLERANCE_PX) return { left: false, right: false };

    return {
        left: box.scrollLeft > EDGE_TOLERANCE_PX,
        right: box.scrollLeft < maxScrollLeft - EDGE_TOLERANCE_PX,
    };
}
