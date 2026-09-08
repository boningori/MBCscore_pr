// 横スクロールする枠の、どちら側に続きが隠れているかの判定。
//
// スコアシート本体はA4固定幅(210mm=794px)で、スマホでは枠に収まらない
// （実測375px: 枠343pxに対して本体794px。見えているのは43%）。右半分の
// ランニングスコア欄・ファウル欄は横スクロールしないと到達できないが、
// 白い紙が画面の端まで続いているだけなので「まだ右がある」と気づけない。
//
// 目印を出す側を決めるのはこの関数だけ。DOMを触らないので、レイアウトを
// 持たない jsdom でも境界をそのまま確かめられる
// （chartScroll.ts の ScrollableAxis と同じ作法）。

import { describe, it, expect } from 'vitest';
import { scrollEdges } from './scrollEdges';

/** 枠343px・中身794px（実測375pxのスコアシート）を、位置だけ変えて作る */
function sheet(scrollLeft: number) {
    return { scrollLeft, scrollWidth: 794, clientWidth: 343 };
}

describe('scrollEdges', () => {
    it('左端では右にだけ続きがある', () => {
        expect(scrollEdges(sheet(0))).toEqual({ left: false, right: true });
    });

    it('途中では両側に続きがある', () => {
        expect(scrollEdges(sheet(200))).toEqual({ left: true, right: true });
    });

    it('右端では左にだけ続きがある', () => {
        expect(scrollEdges(sheet(794 - 343))).toEqual({ left: true, right: false });
    });

    it('全部収まっていればどちらにも出さない', () => {
        expect(scrollEdges({ scrollLeft: 0, scrollWidth: 343, clientWidth: 343 }))
            .toEqual({ left: false, right: false });
    });

    // 幅は mm 指定（210mm）から小数で決まるため、右端まで寄せても
    // scrollLeft + clientWidth が scrollWidth にちょうど一致しないことがある。
    // ここで端とみなさないと、右端まで送っても目印が消えない
    it('1px未満のずれは端とみなす', () => {
        expect(scrollEdges({ scrollLeft: 0.4, scrollWidth: 794, clientWidth: 343 }).left).toBe(false);
        expect(scrollEdges({ scrollLeft: 794 - 343 - 0.4, scrollWidth: 794, clientWidth: 343 }).right).toBe(false);
    });

    // 枠がまだ無い（ref が空）ときは出さないほうへ倒す。出すべきときに出ないのは
    // 一瞬で直るが、続きが無いのに出ていると「スクロールできるはずなのに
    // 動かない」という誤解になる
    it('枠がまだ無ければどちらにも出さない', () => {
        expect(scrollEdges(null)).toEqual({ left: false, right: false });
        expect(scrollEdges(undefined)).toEqual({ left: false, right: false });
    });
});
