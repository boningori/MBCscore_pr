// 公式様式の選手欄は15人分しかない。16人目を追加したとき、実際に様式から
// 外れるのは「追加した選手」とは限らない。名簿は背番号順に並ぶため、若い番号を
// 足すと番号の大きい既存選手が押し出される（実測: #24 が消えた）。
// 記録は残るのに提出物からだけ消えるので、誰が外れるかを事前に示す必要がある。

import { describe, it, expect } from 'vitest';
import { findOverflowPlayer } from './playerLimit';

const p = (number: number, name = `選手${number}`) => ({ number, name });

/** 背番号 10〜24 の15人（様式の枠がちょうど埋まった状態） */
const full = Array.from({ length: 15 }, (_, i) => p(10 + i));

describe('findOverflowPlayer', () => {
    it('14人なら誰も押し出されない', () => {
        expect(findOverflowPlayer(full.slice(0, 14), p(4))).toBeNull();
    });

    it('若い番号を足すと、いちばん大きい番号の既存選手が外れる', () => {
        expect(findOverflowPlayer(full, p(4))).toEqual(p(24));
    });

    it('いちばん大きい番号を足すと、追加した本人が外れる', () => {
        expect(findOverflowPlayer(full, p(99))).toEqual(p(99));
    });

    it('00 は最後に並ぶので、00 を足すと本人が外れる', () => {
        expect(findOverflowPlayer(full, p(100, 'ダブルゼロ'))).toEqual(p(100, 'ダブルゼロ'));
    });

    it('既に00がいるところへ若い番号を足すと、00 が外れる', () => {
        const withDoubleZero = [...full.slice(0, 14), p(100, 'ダブルゼロ')];
        expect(findOverflowPlayer(withDoubleZero, p(4))).toEqual(p(100, 'ダブルゼロ'));
    });

    it('16人を超えていても、外れるのは様式の16番目に当たる選手', () => {
        const sixteen = [...full, p(30)];
        expect(findOverflowPlayer(sixteen, p(4))).toEqual(p(24));
    });
});
