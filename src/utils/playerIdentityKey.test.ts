// 選手の識別キーの形を決める唯一の場所。
//
// キーは localStorage に保存されているので（mergedPlayers の MergeMap、
// playerStatsAnalysis の非表示選手）、形を変えるときは保存済みのキーを
// 読み込み時に矯正しないと、利用者が手で行った統合や非表示が黙って効かなくなる。
// 作る側と矯正する側が別ファイルにあるため、形の定義をここに集めている。

import { describe, it, expect } from 'vitest';
import { normalizePlayerName, buildPlayerIdentityKey, migrateIdentityKey } from './playerIdentityKey';

describe('normalizePlayerName', () => {
    it('半角・全角の空白をすべて取り除く', () => {
        expect(normalizePlayerName('田中 太郎')).toBe('田中太郎');
        expect(normalizePlayerName('加 藤　旺 介')).toBe('加藤旺介');
    });

    it('空白以外は変えない（強い正規化は別人を混ぜる）', () => {
        expect(normalizePlayerName('齋藤ＡＢ')).toBe('齋藤ＡＢ');
    });
});

describe('buildPlayerIdentityKey', () => {
    it('ライセンスNo.は下3桁で揃える', () => {
        expect(buildPlayerIdentityKey('田中太郎', 'ABC1234567'))
            .toBe(buildPlayerIdentityKey('田中太郎', '567'));
    });

    it('下3桁が違えば別キー（同姓同名の区別を保つ）', () => {
        expect(buildPlayerIdentityKey('田中太郎', '123'))
            .not.toBe(buildPlayerIdentityKey('田中太郎', '567'));
    });

    it('氏名の空白の有無でキーが割れない', () => {
        expect(buildPlayerIdentityKey('田中 太郎', '567'))
            .toBe(buildPlayerIdentityKey('田中太郎', '567'));
    });

    it('ライセンスNo.未設定なら氏名のみ', () => {
        expect(buildPlayerIdentityKey('田中 太郎')).toBe('田中太郎');
        expect(buildPlayerIdentityKey('田中太郎', '   ')).toBe('田中太郎');
    });

    it('3文字未満のライセンスNo.はそのまま使う（古い保存データを壊さない）', () => {
        expect(buildPlayerIdentityKey('田中太郎', '12')).toBe('田中太郎_12');
    });
});

describe('migrateIdentityKey', () => {
    it('10桁で保存されたキーを下3桁へ直す', () => {
        expect(migrateIdentityKey('田中太郎_ABC1234567')).toBe('田中太郎_567');
    });

    it('3桁で保存されたキーは変わらない', () => {
        expect(migrateIdentityKey('佐藤花子_123')).toBe('佐藤花子_123');
    });

    it('氏名だけのキーからも空白を取り除く', () => {
        expect(migrateIdentityKey('鈴木 一郎')).toBe('鈴木一郎');
    });

    it('氏名の空白を取り除いたうえで下3桁にする', () => {
        expect(migrateIdentityKey('田中 太郎_ABC1234567')).toBe('田中太郎_567');
    });

    it('氏名にアンダースコアが入っていても切り詰めない', () => {
        // 末尾が半角英数字でなければ、区切りの `_` ではなく氏名の一部
        expect(migrateIdentityKey('鈴木_一郎')).toBe('鈴木_一郎');
        expect(migrateIdentityKey('鈴木_一郎_789')).toBe('鈴木_一郎_789');
    });

    it('矯正済みのキーをもう一度通しても変わらない', () => {
        const once = migrateIdentityKey('田中 太郎_ABC1234567');
        expect(migrateIdentityKey(once)).toBe(once);
    });

    it('空文字を壊さない', () => {
        expect(migrateIdentityKey('')).toBe('');
    });

    it('ライセンスNo.部分に内部空白があっても冪等（2回通しても同じ結果）', () => {
        // 手入力で紛れ込む「A B1234」のような空白入り候補。1回目は空白のせいで
        // 英数字判定に落ちて氏名側の空白除去だけが効き、2回目はその除去後の
        // 文字列が英数字判定を通ってしまうと結果が変わってしまう。
        const key = '田中_A B1234';
        const once = migrateIdentityKey(key);
        expect(migrateIdentityKey(once)).toBe(once);
    });
});

describe('buildPlayerIdentityKey と migrateIdentityKey の整合', () => {
    it('buildPlayerIdentityKey の出力は migrateIdentityKey を通しても変わらない（不動点）', () => {
        const built = buildPlayerIdentityKey('田中', '12 3');
        expect(migrateIdentityKey(built)).toBe(built);
    });

    it('ライセンスNo.の内部空白の有無でキーが割れない', () => {
        expect(buildPlayerIdentityKey('田中', '1 23'))
            .toBe(buildPlayerIdentityKey('田中', '123'));
    });
});
