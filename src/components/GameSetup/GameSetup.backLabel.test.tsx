// 戻るボタンのラベルは行き先を名乗る。
//
// このヘッダーのボタンは、1つ目のステップでは画面ごと抜けてホームへ帰り
// （入力は消える）、2つ目以降は1ステップだけ戻る。どちらも「← 戻る」だったため、
// 同じ見た目のボタンで結果が変わることが読み取れなかった。
// ホームへ帰る画面（マイチーム管理・対戦チーム管理・試合履歴・選手スタッツ分析）は
// どれも「← ホーム」にそろえてある。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GameSetup } from './GameSetup';

beforeEach(() => {
    localStorage.clear();
});

afterEach(cleanup);

describe('GameSetup 戻るボタンのラベル', () => {
    it('1つ目のステップでは行き先のホームを名乗る', () => {
        render(<GameSetup onComplete={() => { }} onBack={() => { }} />);

        expect(screen.getByRole('button', { name: '← ホーム' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '← 戻る' })).toBeNull();
    });

    it('2つ目以降のステップでは1段だけ戻ることを名乗る', () => {
        render(<GameSetup onComplete={() => { }} onBack={() => { }} />);
        fireEvent.click(screen.getByRole('button', { name: '次へ' }));

        expect(screen.getByRole('button', { name: '← 戻る' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '← ホーム' })).toBeNull();
    });

    it('1つ目のステップの戻るはホームへ抜ける', () => {
        const onBack = vi.fn();
        render(<GameSetup onComplete={() => { }} onBack={onBack} />);

        fireEvent.click(screen.getByRole('button', { name: '← ホーム' }));

        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
