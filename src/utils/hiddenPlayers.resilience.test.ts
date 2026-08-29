// 非表示選手の対応表が壊れていても選手スタッツ分析が落ちないこと。
//
// 実測（v1.6.9・実ブラウザ）: チーム単位の値に数値が入っていると
// 「number 5 is not iterable」で分析画面が落ち、ErrorBoundary によって
// アプリ全体がエラー画面に置き換わる（呼び出し側が new Set(...) に渡すため）。
// 手で編集したバックアップを取り込むと起きる。

import { describe, it, expect, beforeEach } from 'vitest';
import { loadHiddenPlayers } from './playerStatsAnalysis';

const KEY = 'minibasket-hidden-players';

describe('loadHiddenPlayers: 壊れた対応表', () => {
    beforeEach(() => localStorage.clear());

    it.each([
        ['数値', 5],
        ['文字列', 'x'],
        ['null', null],
        ['オブジェクト', { a: 1 }],
    ])('値が%sなら空配列（new Set に渡しても落ちない）', (_label, value) => {
        localStorage.setItem(KEY, JSON.stringify({ 'team-1': value }));

        const keys = loadHiddenPlayers('team-1');

        expect(keys).toEqual([]);
        expect(() => new Set(keys)).not.toThrow();
    });

    it('配列に文字列でない要素が混ざっていたら取り除く', () => {
        localStorage.setItem(KEY, JSON.stringify({ 'team-1': ['あ||', null, 3, 'い||'] }));
        expect(loadHiddenPlayers('team-1')).toEqual(['あ||', 'い||']);
    });

    it('健全なら同じ配列をそのまま返す', () => {
        localStorage.setItem(KEY, JSON.stringify({ 'team-1': ['あ||'] }));
        expect(loadHiddenPlayers('team-1')).toEqual(['あ||']);
    });

    it('そのチームの項目が無ければ空配列', () => {
        localStorage.setItem(KEY, JSON.stringify({ other: ['あ||'] }));
        expect(loadHiddenPlayers('team-1')).toEqual([]);
    });
});
