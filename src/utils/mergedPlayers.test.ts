// 割れた選手カードの手動統合の対応表。
//
// 統合は集計時の名寄せで、試合記録は書き換えない。だから解除は対応表から
// 項目を消すだけで済み、間違えて統合しても記録は無傷のまま戻せる。
//
// 保存する対応表は深さ1に保つ。A→B と B→C が同時にあると解決が連鎖し、
// 循環も作れてしまうため。

import { describe, it, expect, beforeEach } from 'vitest';
import {
    normalizeNameForMerge,
    loadMergedPlayers,
    saveMergedPlayers,
    resolveMergedKey,
    mergeKeys,
    unmergeKey,
    mergedCanonicalKeys,
    chooseCanonicalKey,
    carryOverHidden,
} from './mergedPlayers';

beforeEach(() => localStorage.clear());

describe('normalizeNameForMerge', () => {
    it('半角・全角の空白を取り除く', () => {
        expect(normalizeNameForMerge('佐藤 太郎')).toBe('佐藤太郎');
        expect(normalizeNameForMerge('佐藤　太郎')).toBe('佐藤太郎');
        expect(normalizeNameForMerge('佐藤太郎')).toBe('佐藤太郎');
    });

    it('空白以外は変えない（別人を混ぜないため正規化は最小限にする）', () => {
        expect(normalizeNameForMerge('齋藤 太郎')).toBe('齋藤太郎');
        expect(normalizeNameForMerge('斉藤 太郎')).toBe('斉藤太郎');
    });
});

describe('resolveMergedKey', () => {
    it('対応表にあれば代表キーを返す', () => {
        expect(resolveMergedKey({ '佐藤　太郎': '佐藤 太郎' }, '佐藤　太郎')).toBe('佐藤 太郎');
    });

    it('対応表に無ければ元のキーを返す', () => {
        expect(resolveMergedKey({}, '佐藤 太郎')).toBe('佐藤 太郎');
    });

    it('自分自身を指す項目は無視する', () => {
        expect(resolveMergedKey({ 'A': 'A' }, 'A')).toBe('A');
    });
});

describe('mergeKeys', () => {
    it('まとめたキーが代表を指す（代表自身は書かない）', () => {
        const map = mergeKeys({}, ['佐藤　太郎', '佐藤 太郎'], '佐藤 太郎');
        expect(map).toEqual({ '佐藤　太郎': '佐藤 太郎' });
    });

    // A→B のあとに B を C へまとめると、A→C まで張り替えないと連鎖ができる
    it('代表が既に別の代表へ寄っていれば終端を代表にする', () => {
        const first = mergeKeys({}, ['A', 'B'], 'B');
        const second = mergeKeys(first, ['B', 'C'], 'C');
        expect(second).toEqual({ A: 'C', B: 'C' });
        expect(resolveMergedKey(second, 'A')).toBe('C');
    });

    it('既存項目のうち今回まとめるキーを指すものを新しい代表へ張り替える', () => {
        const first = mergeKeys({}, ['A', 'B'], 'B');
        const second = mergeKeys(first, ['B', 'C'], 'B');
        expect(second).toEqual({ A: 'B', C: 'B' });
    });

    it('元の対応表は書き換えない', () => {
        const original = { A: 'B' };
        mergeKeys(original, ['C', 'B'], 'B');
        expect(original).toEqual({ A: 'B' });
    });

    it('2つ未満なら何もしない', () => {
        expect(mergeKeys({}, ['A'], 'A')).toEqual({});
    });
});

describe('unmergeKey', () => {
    it('その代表を指す項目だけを消す', () => {
        const map = { A: 'B', C: 'B', D: 'E' };
        expect(unmergeKey(map, 'B')).toEqual({ D: 'E' });
    });

    it('該当が無ければそのまま', () => {
        expect(unmergeKey({ A: 'B' }, 'Z')).toEqual({ A: 'B' });
    });
});

describe('mergedCanonicalKeys', () => {
    it('まとめ先になっているキーを返す', () => {
        expect([...mergedCanonicalKeys({ A: 'B', C: 'B', D: 'E' })].sort()).toEqual(['B', 'E']);
    });
});

// 代表の選び方は3段。カードに出る氏名は名簿どおりであってほしいので、
// 表記まで一致するものを最優先する。空白の有無だけが違うカードは、
// 名簿と無関係な表記（コートネーム等）より優先する。
describe('chooseCanonicalKey', () => {
    const card = (playerKey: string, name: string, latestDate: string) => ({ playerKey, name, latestDate });

    it('名簿と表記まで同じカードを代表にする（記録が古くても）', () => {
        const chosen = chooseCanonicalKey(
            [card('佐藤　太郎', '佐藤　太郎', '2026-07-01'), card('佐藤 太郎', '佐藤 太郎', '2026-04-01')],
            ['佐藤 太郎'],
        );
        expect(chosen).toBe('佐藤 太郎');
    });

    it('表記まで一致するものが無ければ、空白を無視して名簿に一致するカード', () => {
        const chosen = chooseCanonicalKey(
            [card('タロウ', 'タロウ', '2026-07-01'), card('佐藤　太郎', '佐藤　太郎', '2026-04-01')],
            ['佐藤 太郎'],
        );
        expect(chosen).toBe('佐藤　太郎');
    });

    // ライセンスNo.の打ち間違いで割れた場合、氏名はどちらも名簿どおり
    it('優先度が同じなら、記録がいちばん新しいほう', () => {
        const chosen = chooseCanonicalKey(
            [card('佐藤 太郎_123', '佐藤 太郎', '2026-04-01'), card('佐藤 太郎_456', '佐藤 太郎', '2026-07-01')],
            ['佐藤 太郎'],
        );
        expect(chosen).toBe('佐藤 太郎_456');
    });

    it('どれも名簿に無ければ、記録がいちばん新しいほう', () => {
        const chosen = chooseCanonicalKey(
            [card('A', '田中', '2026-04-01'), card('B', '鈴木', '2026-07-01')],
            ['佐藤 太郎'],
        );
        expect(chosen).toBe('B');
    });

    it('カードが無ければ空文字（呼び出し側が統合を実行しない）', () => {
        expect(chooseCanonicalKey([], ['佐藤 太郎'])).toBe('');
    });
});

describe('carryOverHidden', () => {
    // 統合するとキーが変わる。引き継がないと、非表示にしていた選手が
    // 統合した瞬間に一覧へ復活したように見える
    it('まとめる組のどれかが非表示なら代表を非表示にする', () => {
        expect(carryOverHidden(['A'], ['A', 'B'], 'B').sort()).toEqual(['B']);
    });

    it('元のキーの設定は消す', () => {
        expect(carryOverHidden(['A', 'B'], ['A', 'B'], 'B')).toEqual(['B']);
    });

    it('どれも非表示でなければ何も足さない', () => {
        expect(carryOverHidden(['Z'], ['A', 'B'], 'B')).toEqual(['Z']);
    });

    it('無関係な非表示設定は残す', () => {
        expect(carryOverHidden(['Z', 'A'], ['A', 'B'], 'B').sort()).toEqual(['B', 'Z']);
    });
});

describe('保存と読み込み', () => {
    it('チームごとに保存して読み戻せる', () => {
        saveMergedPlayers('t1', { A: 'B' });
        saveMergedPlayers('t2', { C: 'D' });
        expect(loadMergedPlayers('t1')).toEqual({ A: 'B' });
        expect(loadMergedPlayers('t2')).toEqual({ C: 'D' });
    });

    it('未設定のチームは空', () => {
        expect(loadMergedPlayers('none')).toEqual({});
    });

    // 配列やnullが入っているとチームIDでの索引が壊れる
    it('壊れた形が入っていたら統合なしとして扱う', () => {
        localStorage.setItem('minibasket-merged-players', JSON.stringify([1, 2]));
        expect(loadMergedPlayers('t1')).toEqual({});
    });

    // トップレベルは素のオブジェクトとして正しくても、chunk[teamId]自体が
    // 壊れている（手で編集したバックアップ等）場合に備える。ここを見ずに
    // そのまま返すと、呼び出し側がMergeMapとして扱って落ちる
    it('チーム単位の中身が壊れていたら統合なしとして扱う', () => {
        localStorage.setItem('minibasket-merged-players', JSON.stringify({ t1: [1, 2] }));
        expect(loadMergedPlayers('t1')).toEqual({});
    });
});
