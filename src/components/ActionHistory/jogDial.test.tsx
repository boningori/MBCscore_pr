// アクション履歴のジョグダイヤルがマウスで動かなかった。
//
// ドラッグ中フラグを ref に持ち、それを見る useEffect の依存が
// 安定した useCallback だけだったため、効果はマウント時に1回走るきり。
// その時点では常に false なので document の mousemove / mouseup が
// 一度も登録されず、つまみを掴んでも何も起きなかった（タッチは
// 要素に直接 onTouchMove が付いているので動いていた）。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ActionHistory } from './ActionHistory';
import { createPlayer } from '../../types/game';
import type { ScoreEntry } from '../../types/game';

afterEach(cleanup);

const players = [createPlayer('p1', 4, '選手4')];

// ジョグダイヤルは4件を超えたときだけ出る
const scores: ScoreEntry[] = Array.from({ length: 5 }, (_, i) => ({
    id: `s${i}`, teamId: 'teamA', playerId: 'p1', playerNumber: 4,
    scoreType: '2P', points: 2, quarter: 1, timestamp: 1000 + i,
    runningScoreA: 2 * (i + 1), runningScoreB: 0,
}));

function renderDial() {
    const { container } = render(
        <ActionHistory
            teamId="teamA" teamName="ホーム"
            scoreHistory={scores} statHistory={[]} foulHistory={[]}
            players={players}
            onRemoveScore={vi.fn()} onRemoveStat={vi.fn()} onRemoveFoul={vi.fn()}
        />
    );
    const dial = container.querySelector('.jog-dial') as HTMLElement;
    const inner = container.querySelector('.dial-inner') as HTMLElement;
    return { dial, inner };
}

/** つまみの回転角（未回転なら0） */
const angleOf = (inner: HTMLElement) =>
    Number(/rotate\((-?[\d.]+)deg\)/.exec(inner.style.transform)?.[1] ?? 0);

describe('アクション履歴のジョグダイヤル', () => {
    it('マウスで掴んで動かすと回る', () => {
        const { dial, inner } = renderDial();

        fireEvent.mouseDown(dial, { clientY: 100 });
        fireEvent.mouseMove(document, { clientY: 150 });

        expect(angleOf(inner)).not.toBe(0);
    });

    it('マウスを離したらそれ以上追従しない', () => {
        const { dial, inner } = renderDial();
        fireEvent.mouseDown(dial, { clientY: 100 });
        fireEvent.mouseMove(document, { clientY: 150 });
        const held = angleOf(inner);

        fireEvent.mouseUp(document);
        fireEvent.mouseMove(document, { clientY: 400 });

        expect(angleOf(inner)).toBe(held);
    });

    it('掴んでいなければ動かしても回らない', () => {
        const { inner } = renderDial();

        fireEvent.mouseMove(document, { clientY: 400 });

        expect(angleOf(inner)).toBe(0);
    });

    it('タッチでも従来どおり回る', () => {
        const { dial, inner } = renderDial();

        fireEvent.touchStart(dial, { touches: [{ clientY: 100 }] });
        fireEvent.touchMove(dial, { touches: [{ clientY: 150 }] });

        expect(angleOf(inner)).not.toBe(0);
    });
});
