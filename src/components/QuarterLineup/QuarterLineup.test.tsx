import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QuarterLineup } from './QuarterLineup';
import { createPlayer } from '../../types/game';
import type { Player } from '../../types/game';

afterEach(cleanup);

function player(
    id: string,
    number: number,
    quartersPlayed: Player['quartersPlayed'],
    isOnCourt = false,
): Player {
    return { ...createPlayer(id, number, `選手${number}`), quartersPlayed, isOnCourt };
}

describe('QuarterLineup 出場ルールの目安（非強制の警告表示）', () => {
    it('Q1では警告チップも未出場バナーも表示しない', () => {
        const players = [
            player('a', 4, [false, false, false, false]),
            player('b', 5, [false, false, false, false]),
        ];
        render(<QuarterLineup quarter={1} teamName="T" players={players} onConfirm={() => {}} />);

        expect(screen.queryByText('3Q超')).toBeNull();
        expect(screen.queryByText('2Q未達')).toBeNull();
        expect(screen.queryByText(/未出場（全員出場の目安）/)).toBeNull();
    });

    it('Q4: 既に3Q出場済みの選手を出そうとすると「3Q超」、未出場の選手は「2Q未達」＋未出場バナー', () => {
        const players = [
            // Q1-Q3出場済み・コート上（初期選択される）→ 4Q目で最大3Q超過
            player('heavy', 5, [true, true, true, false], true),
            // 2Q出場済み → 違反なし（誤検知しないこと）
            player('normal', 6, [true, true, false, false], true),
            // 未出場 → 残り1Qでは2Qに届かない ＋ 全員出場の目安に該当
            player('bench', 9, [false, false, false, false], false),
        ];
        render(<QuarterLineup quarter={4} teamName="T" players={players} onConfirm={() => {}} />);

        // 「3Q超」はheavyの1件のみ
        expect(screen.getAllByText('3Q超')).toHaveLength(1);
        // 「2Q未達」はbenchの1件のみ
        expect(screen.getAllByText('2Q未達')).toHaveLength(1);
        // 全員出場の目安バナーに #9 が含まれる
        expect(screen.getByText(/未出場（全員出場の目安）/).textContent).toContain('#9');
    });

    it('警告があっても開始ボタンはブロックしない（強制しない）', () => {
        // 5名ちょうどでスタメンが揃えば、ルール警告に関わらず確定可能
        const players = [
            player('heavy', 5, [true, true, true, false], true),
            player('p6', 6, [true, false, false, false], true),
            player('p7', 7, [false, true, false, false], true),
            player('p8', 8, [true, false, false, false], true),
            player('p9', 9, [false, true, false, false], true),
        ];
        render(<QuarterLineup quarter={4} teamName="T" players={players} onConfirm={() => {}} />);

        // 「3Q超」の警告は出るが…
        expect(screen.getByText('3Q超')).toBeTruthy();
        // 開始ボタンは押下可能（disabledでない）
        const startBtn = screen.getByRole('button', { name: /開始/ }) as HTMLButtonElement;
        expect(startBtn.disabled).toBe(false);
    });
});
