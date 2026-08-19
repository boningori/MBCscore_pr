// 割れていそうなカードの検知。
//
// 割れているカードは利用者が気づかないと直しようがない。とくに
// eslint-disable-next-line no-irregular-whitespace
// 「佐藤 太郎」と「佐藤　太郎」（全角スペース）は一覧に並んでも見分けが付かない。
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
});
