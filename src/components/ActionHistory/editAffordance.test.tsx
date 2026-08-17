import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ActionHistory } from './ActionHistory';
import type { ScoreEntry, FoulEntry, Player } from '../../types/game';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const players: Player[] = [
    createPlayer('a1', 4, '選手A1'),
    createPlayer('a2', 5, '選手A2'),
];

const score: ScoreEntry = {
    id: 's1', teamId: 'teamA', playerId: 'a1', playerNumber: 4,
    scoreType: '2P', points: 2, quarter: 1, timestamp: 2000,
    runningScoreA: 2, runningScoreB: 0,
};

const foul: FoulEntry = {
    id: 'f1', teamId: 'teamA', playerId: 'a1', playerNumber: 4,
    foulType: 'P', quarter: 1, timestamp: 1000, isCoachOrBench: false,
};

const noop = () => { };

function renderHistory(overrides: Partial<Parameters<typeof ActionHistory>[0]> = {}) {
    return render(
        <ActionHistory
            teamId="teamA"
            teamName="ホーム"
            scoreHistory={[score]}
            statHistory={[]}
            foulHistory={[foul]}
            players={players}
            onRemoveScore={noop}
            onRemoveStat={noop}
            onRemoveFoul={noop}
            onEditScore={noop}
            onEditStat={noop}
            {...overrides}
        />
    );
}

/** 対象の行のメニューを開く（行はEnterでメニューを開く作り） */
function openMenu(text: string) {
    const row = screen.getByText(text).closest('button')!;
    fireEvent.keyDown(row, { key: 'Enter' });
}

describe('ActionHistory: 編集の導線', () => {
    it('得点には編集を出す', () => {
        renderHistory();
        openMenu('2P成功 +2');
        expect(screen.getByRole('button', { name: '編集' })).toBeTruthy();
    });

    // EditActionModal は得点・スタッツ用で、ファウルを渡すとスタッツ種別を
    // 選ばせたうえに保存が何も起こさない（無言で捨てる）。出さないこと自体が仕様
    it('ファウルには編集を出さず、削除して入れ直すよう案内する', () => {
        renderHistory();
        openMenu('パーソナルファウル');

        expect(screen.queryByRole('button', { name: '編集' })).toBeNull();
        expect(screen.getByRole('button', { name: '削除' })).toBeTruthy();
        expect(screen.getByText(/削除して入力し直/)).toBeTruthy();
    });
});

describe('ActionHistory: 変換で選手を付け替える', () => {
    it('変換のコールバックに選択した選手IDを渡す', () => {
        const onConvertScoreToMiss = vi.fn();
        renderHistory({ onConvertScoreToMiss });

        openMenu('2P成功 +2');
        fireEvent.click(screen.getByRole('button', { name: '編集' }));

        // 選手を a2 に、種別を 2Pミス に変えてから変換する
        fireEvent.change(screen.getByLabelText('選手'), { target: { value: 'a2' } });
        fireEvent.change(screen.getByLabelText('シュート結果'), { target: { value: '2PA' } });
        fireEvent.click(screen.getByRole('button', { name: '変換' }));

        expect(onConvertScoreToMiss).toHaveBeenCalledWith('s1', '2PA', 'a2');
    });
});
