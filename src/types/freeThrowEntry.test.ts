// FT結果の入力が揃ったかの判定。
//
// FoulInputFlow は入力途中を null で表しているのに、状態の型は
// FreeThrowResult[]（'made' | 'missed'）と宣言していた。null は
// `new Array(n).fill(null)`（Array(n) が any[] になる）と
// `null as unknown as FreeThrowResult` の2経路で押し込まれていた。
//
// 実害は無かった。handleFtResultComplete が some(r => r === null) で弾き、
// 外へは出していないためである。危ういのは、型が実態を表していないので
// 「その番人を外しても TypeScript が黙る」ことだった。v1.12 で直した
// TEAM_FOUL_LIMIT の重複と同じ性質である。
//
// 判定を型ガードにして、番人と「外へ出す値」をコンパイラが結び付けるようにする。

import { describe, it, expect } from 'vitest';
import { areFreeThrowsEntered } from './game';
import type { FreeThrowResult } from './game';

describe('FT結果が揃っているか', () => {
    it('全部入っていれば真', () => {
        expect(areFreeThrowsEntered(['made', 'missed'])).toBe(true);
    });

    it('1つでも未入力なら偽', () => {
        expect(areFreeThrowsEntered(['made', null])).toBe(false);
        expect(areFreeThrowsEntered([null, 'made'])).toBe(false);
    });

    it('全部未入力なら偽', () => {
        expect(areFreeThrowsEntered([null, null])).toBe(false);
    });

    it('0本（空配列）は揃っているとみなす', () => {
        // T/U/D は0本を選べないが、Pのペナルティ以外では本数0で完了する経路がある
        expect(areFreeThrowsEntered([])).toBe(true);
    });

    it('型ガードとして働く（narrow したあとは null を含まない）', () => {
        const results: (FreeThrowResult | null)[] = ['made', 'missed'];
        if (areFreeThrowsEntered(results)) {
            // ここで results は FreeThrowResult[] に絞られている。
            // 絞れていなければ下の代入が tsc -b で落ちる
            const narrowed: FreeThrowResult[] = results;
            expect(narrowed).toEqual(['made', 'missed']);
        } else {
            throw new Error('揃っているはずが偽になった');
        }
    });
});
