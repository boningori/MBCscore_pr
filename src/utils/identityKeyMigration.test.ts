// 識別キーの作り方を変えたので、保存済みのキーを読み込み時に矯正する。
//
// キーは2つの保存領域に入っている——手動統合の対応表と、非表示選手の一覧。
// 直さずに読むと、利用者が手で行った統合が効かなくなり、非表示にした選手が
// 黙って再表示される。どちらも「操作したのに元に戻っている」という形で出る。

import { describe, it, expect, beforeEach } from 'vitest';
import { loadMergedPlayers, loadAllMergedPlayers, mergedCanonicalKeys } from './mergedPlayers';
import { generatePlayerKey, loadHiddenPlayers, isPlayerHidden } from './playerStatsAnalysis';

const MERGED_KEY = 'minibasket-merged-players';
const HIDDEN_KEY = 'minibasket-hidden-players';

beforeEach(() => {
    localStorage.clear();
});

describe('generatePlayerKey', () => {
    it('10桁と下3桁が同じキーになる', () => {
        expect(generatePlayerKey('田中太郎', 'ABC1234567'))
            .toBe(generatePlayerKey('田中太郎', '567'));
    });

    it('氏名の空白の有無でキーが割れない', () => {
        expect(generatePlayerKey('田中 太郎', '567'))
            .toBe(generatePlayerKey('田中太郎', '567'));
    });

    it('下3桁が違えば別キーのまま（同姓同名の区別を保つ）', () => {
        expect(generatePlayerKey('田中太郎', '123'))
            .not.toBe(generatePlayerKey('田中太郎', '567'));
    });

    it('ライセンスNo.未設定なら氏名のみ', () => {
        expect(generatePlayerKey('田中太郎')).toBe('田中太郎');
    });
});

describe('保存済みの手動統合の矯正', () => {
    it('10桁で保存されたキーが、新しいキーで引ける', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: { '田中太郎_ABC1234567': '田中太郎_DEF9876543' },
        }));

        const map = loadMergedPlayers('teamA');

        expect(map[generatePlayerKey('田中太郎', 'ABC1234567')])
            .toBe(generatePlayerKey('田中太郎', 'DEF9876543'));
    });

    it('氏名に空白が入ったまま保存されたキーも引ける', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: { '田中 太郎_567': '田中太郎_123' },
        }));

        const map = loadMergedPlayers('teamA');

        expect(map[generatePlayerKey('田中太郎', '567')])
            .toBe(generatePlayerKey('田中太郎', '123'));
    });

    it('ライセンスNo.が無いキー（氏名のみ）も矯正する', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: { '鈴木 一郎': '鈴木一郎_789' },
        }));

        expect(loadMergedPlayers('teamA')['鈴木一郎']).toBe('鈴木一郎_789');
    });

    it('旧キーと新キーが両方あっても、読み込むたびに同じ結果になる', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: {
                '田中太郎_ABC1234567': '田中太郎_111',
                '田中太郎_567': '田中太郎_222',
            },
        }));

        const first = loadMergedPlayers('teamA');
        const second = loadMergedPlayers('teamA');

        expect(first).toEqual(second);
        // 先に現れたほうを残す
        expect(first['田中太郎_567']).toBe('田中太郎_111');
    });

    it('loadAllMergedPlayers も矯正する（バックアップ経由で入ったデータ）', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: { '田中太郎_ABC1234567': '田中太郎_DEF9876543' },
        }));

        expect(loadAllMergedPlayers().teamA['田中太郎_567']).toBe('田中太郎_543');
    });

    it('壊れたチーム単位の値は空として扱う（既存の守りを保つ）', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({ teamA: [1, 2, 3] }));

        expect(loadMergedPlayers('teamA')).toEqual({});
    });

    it('手動統合済みの10桁と下3桁が矯正で自己参照になったら対応表から消える', () => {
        // 利用者が10桁カードと下3桁カードを手で統合済み。矯正すると両辺とも
        // 同じキーになり、放置すると「統合済み」バッジだけが誤って残る
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: { '田中太郎_ABC1234567': '田中太郎_567' },
        }));

        const map = loadMergedPlayers('teamA');

        expect(map).toEqual({});
    });

    it('自己参照の項目が、同じキーへ移る本物の統合を締め出さない（先に自己参照）', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: {
                '田中太郎_ABC1234567': '田中太郎_567',
                '田中太郎_567': '田中太郎_999',
            },
        }));

        const map = loadMergedPlayers('teamA');

        expect(map['田中太郎_567']).toBe('田中太郎_999');
    });

    it('自己参照の項目が、同じキーへ移る本物の統合を締め出さない（後に自己参照）', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: {
                '田中太郎_567': '田中太郎_999',
                '田中太郎_ABC1234567': '田中太郎_567',
            },
        }));

        const map = loadMergedPlayers('teamA');

        expect(map['田中太郎_567']).toBe('田中太郎_999');
    });

    it('自己参照になったキーは mergedCanonicalKeys（統合済み判定）にも残らない', () => {
        localStorage.setItem(MERGED_KEY, JSON.stringify({
            teamA: { '田中太郎_ABC1234567': '田中太郎_567' },
        }));

        const map = loadMergedPlayers('teamA');

        expect(mergedCanonicalKeys(map).has('田中太郎_567')).toBe(false);
    });
});

describe('保存済みの非表示選手の矯正', () => {
    it('10桁で保存されたキーが、新しいキーで引ける', () => {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify({
            teamA: ['田中太郎_ABC1234567'],
        }));

        expect(loadHiddenPlayers('teamA')).toEqual(['田中太郎_567']);
        expect(isPlayerHidden('teamA', generatePlayerKey('田中太郎', '567'))).toBe(true);
    });

    it('氏名に空白が入ったまま保存されたキーも引ける', () => {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify({
            teamA: ['田中 太郎_567'],
        }));

        expect(isPlayerHidden('teamA', generatePlayerKey('田中太郎', '567'))).toBe(true);
    });

    it('矯正で重複したキーは1つに畳む', () => {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify({
            teamA: ['田中太郎_ABC1234567', '田中太郎_567'],
        }));

        expect(loadHiddenPlayers('teamA')).toEqual(['田中太郎_567']);
    });

    it('文字列以外が混じっていても落ちない（既存の守りを保つ）', () => {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify({ teamA: ['田中太郎_567', 5, null] }));

        expect(loadHiddenPlayers('teamA')).toEqual(['田中太郎_567']);
    });

    it('配列でなければ空を返す（既存の守りを保つ）', () => {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify({ teamA: 5 }));

        expect(loadHiddenPlayers('teamA')).toEqual([]);
    });
});
