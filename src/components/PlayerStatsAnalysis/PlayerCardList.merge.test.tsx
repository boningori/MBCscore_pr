// 選択モードと統合済みの印。
//
// 選択モード中にカードを押すと詳細が開いてしまうと、統合の選択ができない。
// 統合済みの印が無いと、まとめたのかどうかを詳細を開いて確かめるしかない。
//
// カードの特定に getByRole の name は使えない。testing-library の既定の
// ノーマライザは \s+ を半角スペースへ畳み、全角スペース(U+3000)も \s に
// 含まれる。つまり「佐藤(全角スペース)太郎」と「佐藤 太郎」はアクセシブル名として同じに
// なり、多重一致で落ちる（この機能がまさに救おうとしている表記ゆれ）。
// 位置で引く。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { makeAggregatedPlayer } from '../../test/statsFactories';
import { PlayerCardList } from './PlayerCardList';

afterEach(cleanup);

const players = [
    makeAggregatedPlayer({ playerKey: '佐藤 太郎', name: '佐藤 太郎', number: 4 }),
    makeAggregatedPlayer({ playerKey: '佐藤　太郎', name: '佐藤　太郎', number: 7 }),
];

const cardsOf = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLButtonElement>('.player-card')];

describe('PlayerCardList: 選択モード', () => {
    it('選択モードではカードを押すと選択が切り替わり、詳細は開かない', () => {
        const onPlayerClick = vi.fn();
        const onToggleSelect = vi.fn();
        const { container } = render(
            <PlayerCardList
                players={players}
                onPlayerClick={onPlayerClick}
                selectionMode
                selectedKeys={new Set()}
                onToggleSelect={onToggleSelect}
            />,
        );

        fireEvent.click(cardsOf(container)[0]);

        expect(onToggleSelect).toHaveBeenCalledWith('佐藤 太郎');
        expect(onPlayerClick).not.toHaveBeenCalled();
    });

    it('選択中のカードは押された状態として読み上げられる', () => {
        const { container } = render(
            <PlayerCardList
                players={players}
                onPlayerClick={vi.fn()}
                selectionMode
                selectedKeys={new Set(['佐藤 太郎'])}
                onToggleSelect={vi.fn()}
            />,
        );

        const [first, second] = cardsOf(container);
        expect(first.getAttribute('aria-pressed')).toBe('true');
        expect(second.getAttribute('aria-pressed')).toBe('false');
    });

    it('選択モードでなければ従来どおり詳細が開く', () => {
        const onPlayerClick = vi.fn();
        const { container } = render(<PlayerCardList players={players} onPlayerClick={onPlayerClick} />);

        fireEvent.click(cardsOf(container)[0]);

        expect(onPlayerClick).toHaveBeenCalledTimes(1);
        expect(cardsOf(container)[0].getAttribute('aria-pressed')).toBeNull();
    });
});

describe('PlayerCardList: 統合済みの印', () => {
    it('統合済みの代表キーには印が出る', () => {
        render(
            <PlayerCardList
                players={players}
                onPlayerClick={vi.fn()}
                mergedKeys={new Set(['佐藤 太郎'])}
            />,
        );

        expect(screen.getAllByText('統合済み')).toHaveLength(1);
    });

    it('統合していなければ印は出ない', () => {
        render(<PlayerCardList players={players} onPlayerClick={vi.fn()} />);

        expect(screen.queryByText('統合済み')).toBeNull();
    });
});
