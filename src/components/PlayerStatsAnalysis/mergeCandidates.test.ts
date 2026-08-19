// 割れていそうなカードの検知。
//
// 割れているカードは利用者が気づかないと直しようがない。とくに半角スペースの
// 「佐藤 太郎」と、間に全角スペース(U+3000)を挟んだだけの同姓同名は
// 一覧に並んでも見分けが付かない。
//
// 検知は提案までで、確認なしには統合しない。背番号の一致は条件に使わない
// —— ミニバスは6年生が抜けたあと下級生が番号を引き継ぐので、別人が同じ番号で
// 毎年候補に出てしまう。

import { describe, it, expect } from 'vitest';
import { makeAggregatedPlayer } from '../../test/statsFactories';
import { findMergeCandidates } from './mergeCandidates';

const card = (playerKey: string, name: string, number = 4) =>
    makeAggregatedPlayer({ playerKey, name, number });

describe('findMergeCandidates', () => {
    it('全角・半角スペースの違いだけの氏名を1組として拾う', () => {
        const groups = findMergeCandidates(
            [card('佐藤 太郎', '佐藤 太郎'), card('佐藤　太郎', '佐藤　太郎')],
            ['佐藤 太郎'],
        );

        expect(groups).toHaveLength(1);
        expect(groups[0].map(p => p.playerKey).sort()).toEqual(['佐藤 太郎', '佐藤　太郎']);
    });

    it('スペース無しの表記も同じ組に入る', () => {
        const groups = findMergeCandidates(
            [card('佐藤 太郎', '佐藤 太郎'), card('佐藤太郎', '佐藤太郎')],
            ['佐藤 太郎'],
        );

        expect(groups).toHaveLength(1);
    });

    // 名簿で別々のライセンスNo.を割り当てて区別している2人を
    // 「割れている」と誤って案内しない
    it('名簿に同じ氏名が2人いる組は候補にしない', () => {
        const groups = findMergeCandidates(
            [card('田中 花子_111', '田中 花子'), card('田中 花子_222', '田中 花子')],
            ['田中 花子', '田中 花子'],
        );

        expect(groups).toEqual([]);
    });

    it('1枚しかない氏名は候補にしない', () => {
        expect(findMergeCandidates([card('佐藤 太郎', '佐藤 太郎')], ['佐藤 太郎'])).toEqual([]);
    });

    it('氏名がまったく違う組は拾わない（手動で統合する）', () => {
        const groups = findMergeCandidates(
            [card('タロウ', 'タロウ'), card('佐藤 太郎', '佐藤 太郎')],
            ['佐藤 太郎'],
        );

        expect(groups).toEqual([]);
    });

    it('背番号が同じでも氏名が違えば候補にしない', () => {
        const groups = findMergeCandidates(
            [card('鈴木 一郎', '鈴木 一郎', 4), card('佐藤 太郎', '佐藤 太郎', 4)],
            ['鈴木 一郎', '佐藤 太郎'],
        );

        expect(groups).toEqual([]);
    });

    it('組が複数あればすべて返す', () => {
        const groups = findMergeCandidates(
            [
                card('佐藤 太郎', '佐藤 太郎'), card('佐藤　太郎', '佐藤　太郎'),
                card('鈴木 一郎', '鈴木 一郎'), card('鈴木　一郎', '鈴木　一郎'),
            ],
            ['佐藤 太郎', '鈴木 一郎'],
        );

        expect(groups).toHaveLength(2);
    });

    it('カードが無ければ空', () => {
        expect(findMergeCandidates([], [])).toEqual([]);
    });

    // 氏名未入力の取り込み等で正規化後に空文字になるカードが混ざり得る。
    // 空文字どうしを同じ組と誤認しないよう、候補から外す
    it('氏名が空のカードは候補にしない', () => {
        const groups = findMergeCandidates(
            [card('空1', ''), card('空2', '')],
            [],
        );

        expect(groups).toEqual([]);
    });

    // 退団した選手のカードが割れている場合、名簿には載っていない
    // （rosterCount が0）。名簿に無いことを理由に除外してはいけない
    it('名簿に載っていない氏名の重複は候補になる（退団済みでも検知する）', () => {
        const groups = findMergeCandidates(
            [card('山田 次郎', '山田 次郎'), card('山田　次郎', '山田　次郎')],
            [],
        );

        expect(groups).toHaveLength(1);
    });

    it('正規化後に同じになる3枚以上も1つの組として返る', () => {
        const groups = findMergeCandidates(
            [
                card('高橋 三郎', '高橋 三郎'),
                card('高橋　三郎', '高橋　三郎'),
                card('高橋三郎', '高橋三郎'),
            ],
            ['高橋 三郎'],
        );

        expect(groups).toHaveLength(1);
        expect(groups[0]).toHaveLength(3);
    });
});
