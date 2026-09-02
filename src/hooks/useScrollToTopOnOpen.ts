import { useEffect, useRef } from 'react';

/**
 * 画面・サブビューを開いたときに、ページを先頭へ戻す。
 *
 * このアプリはURLルーティングを持たず、画面もサブビューもReactのstateを
 * 差し替えて描き直しているだけなので、ブラウザの「新しいページは先頭から」が
 * 効かない。前の画面のスクロール位置がそのまま残る。
 *
 * 実測（v1.6.15・本番ビルド・375x812）:
 *   - ホームを下までスクロールして「選手スタッツ分析」を押すと、開いた画面の
 *     ヘッダーが top:-73 の位置にある（「← ホーム」ごと画面外）
 *   - 選手一覧を最下部(1902px)までスクロールして最後の選手カードを押すと、
 *     詳細が1902pxのまま開く。全高4185pxの真ん中「リバウンド比率」から始まり、
 *     選手名も「← 一覧」も画面外にある
 * 一覧が長い画面ほど深くスクロールしてから次を開くので、いちばん押される
 * カードほどひどい位置で開くことになる。
 *
 * 一覧へ戻るときは動かさない（key === null）。10件の履歴を見比べている最中に
 * 毎回先頭へ戻されると、見ていた行を探し直すことになる。ブラウザの戻るが
 * 位置を復元するのと同じ扱いにしたいが、位置の記憶までは持たせていない
 * ——「開くときだけ先頭」で、実害のある側だけを直す。
 *
 * window.scrollTo ではなく scrollingElement を直接動かす。挙動は同じだが、
 * jsdom は window.scrollTo を「Not implemented」として虚空へ吐くため、
 * App を描くテストすべてにノイズが乗る。
 *
 * @param key 開いているサブビューの識別子。一覧（何も開いていない）は null。
 *   画面単位で使う場合は画面名をそのまま渡す（null にならないので毎回先頭へ戻る）
 */
export function useScrollToTopOnOpen(key: string | null): void {
    const prevRef = useRef(key);

    useEffect(() => {
        if (prevRef.current === key) return;
        prevRef.current = key;
        // 一覧へ戻るときは位置を保つ
        if (key === null) return;
        const scroller = document.scrollingElement ?? document.documentElement;
        if (scroller) scroller.scrollTop = 0;
    }, [key]);
}
