// FT入力中のタイムアウト・選手交代。
//
// FoulInputFlow は背後の選手カードを一切触らせないため、FT結果を入れている
// 最中にタイムアウトや交代が入ると、記録者には「FTを最後まで入れてから戻る」か
// 「キャンセルして入力を捨てる」しか手が無かった。
//
// 出すのはシューターが確定して以降だけ。確定前に交代が入ると、候補リストが
// 今のコート状況から引き直されるため、ファウル時点でコートにいなかった選手が
// 並び、ファウルされた本人が下がっていれば候補から消える。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { createPlayer } from '../../types/game';

afterEach(cleanup);

const OPPONENTS = [
    { ...createPlayer('b1', 10, '相手1'), isOnCourt: true },
    { ...createPlayer('b2', 11, '相手2'), isOnCourt: true },
];

const TEAMS = [
    { id: 'teamA' as const, name: '東京中', timeoutUsed: false },
    { id: 'teamB' as const, name: '大阪中', timeoutUsed: false },
];

function renderFlow(overrides: Partial<Parameters<typeof FoulInputFlow>[0]> = {}) {
    const onRequestTimeout = vi.fn();
    const onRequestSubstitution = vi.fn();
    render(
        <FoulInputFlow
            hasSelectedPlayer
            playerName="佐藤 花子"
            playerNumber={5}
            // 4個目まで済み＝このファウルからペナルティ。Pの通常タップで
            // 直接シューター選択へ入るので、テストの導線が短くなる
            teamFouls={4}
            opponentTeamId="teamB"
            opponentTeamName="相手"
            opponentPlayers={OPPONENTS}
            interruptTeams={TEAMS}
            onRequestTimeout={onRequestTimeout}
            onRequestSubstitution={onRequestSubstitution}
            onComplete={vi.fn()}
            onCancel={vi.fn()}
            {...overrides}
        />,
    );
    return { onRequestTimeout, onRequestSubstitution };
}

/** Pファウルを通常タップ（キーボード経路）してシューター選択へ入る */
function tapPFoul() {
    const pButton = screen.getByText('パーソナルファウル').closest('button')!;
    fireEvent.keyDown(pButton, { key: 'Enter' });
}

/** シューターを選ぶ（まだ「次へ」は押さない） */
function selectShooter() {
    fireEvent.click(screen.getByText('相手1').closest('button')!);
}

/** FT結果入力まで進む */
function goToFtResult() {
    tapPFoul();
    selectShooter();
    fireEvent.click(screen.getByText('次へ'));
}

describe('中断ブロック: 表示条件', () => {
    it('ファウル種類選択では出ない', () => {
        renderFlow();
        expect(screen.queryByText('試合の中断')).toBeNull();
    });

    it('シューター選択でまだ誰も選んでいなければ出ない', () => {
        renderFlow();
        tapPFoul();
        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expect(screen.queryByText('試合の中断')).toBeNull();
    });

    it('FT本数選択では出ない', () => {
        renderFlow();
        // T は本数選択ステップへ入る
        fireEvent.click(screen.getByText('テクニカルファウル').closest('button')!);
        expect(screen.getByText('フリースロー本数を選択')).toBeTruthy();
        expect(screen.queryByText('試合の中断')).toBeNull();
    });

    it('シューターを選んだ後は、シューター選択のままでも出る', () => {
        renderFlow();
        tapPFoul();
        selectShooter();
        expect(screen.getByText('試合の中断')).toBeTruthy();
        expect(screen.getByText('⏱ タイムアウト')).toBeTruthy();
        expect(screen.getByText('🔄 選手交代')).toBeTruthy();
    });

    it('FT結果入力でも出る', () => {
        renderFlow();
        goToFtResult();
        expect(screen.getByText('試合の中断')).toBeTruthy();
    });

    it('interruptTeams を渡さなければ出ない（保留アクション解決の経路）', () => {
        renderFlow({ interruptTeams: undefined });
        goToFtResult();
        expect(screen.queryByText('試合の中断')).toBeNull();
    });

    it('onRequestTimeout を渡さなければ交代のボタンだけが出る', () => {
        renderFlow({ onRequestTimeout: undefined });
        goToFtResult();
        expect(screen.queryByText('⏱ タイムアウト')).toBeNull();
        expect(screen.getByText('🔄 選手交代')).toBeTruthy();
    });
});

describe('中断ブロック: チーム選択', () => {
    it('タイムアウトを押すと同じ行がチーム選択に入れ替わる', () => {
        renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));

        expect(screen.getByText('タイムアウトを記録するチーム')).toBeTruthy();
        expect(screen.getByText('東京中')).toBeTruthy();
        expect(screen.getByText('大阪中')).toBeTruthy();
        // 入れ替わりなので元のボタンは消える
        expect(screen.queryByText('⏱ タイムアウト')).toBeNull();
        expect(screen.queryByText('🔄 選手交代')).toBeNull();
    });

    it('チームを押すと onRequestTimeout がそのチームIDで呼ばれ、初期状態に戻る', () => {
        const { onRequestTimeout } = renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('⏱ タイムアウト'));
        fireEvent.click(screen.getByText('大阪中'));

        expect(onRequestTimeout).toHaveBeenCalledWith('teamB');
        expect(screen.getByText('⏱ タイムアウト')).toBeTruthy();
    });

    it('交代も同じようにチームを選んで onRequestSubstitution が呼ばれる', () => {
        const { onRequestSubstitution } = renderFlow();
        goToFtResult();
        fireEvent.click(screen.getByText('🔄 選手交代'));

        expect(screen.getByText('選手交代をするチーム')).toBeTruthy();
        fireEvent.click(screen.getByText('東京中'));
        expect(onRequestSubstitution).toHaveBeenCalledWith('teamA');
    });

    it('FT結果を入れた後にタイムアウトを要求しても、入力とステップが残る', () => {
        const { onRequestTimeout } = renderFlow();
        goToFtResult();
        const madeButtons = screen.getAllByText('○ 成功');
        fireEvent.click(madeButtons[0]);
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();

        fireEvent.click(screen.getByText('⏱ タイムアウト'));
        fireEvent.click(screen.getByText('東京中'));

        expect(onRequestTimeout).toHaveBeenCalledWith('teamA');
        // FT結果入力のまま、入れた1本目も残っている
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();
        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();
    });
});
