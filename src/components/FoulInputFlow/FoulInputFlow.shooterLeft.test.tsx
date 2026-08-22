// FTを打つ選手が負傷退場した場合。
//
// 規則では、シューターが負傷・失格でコートを離れたら、交代で入った選手が
// 残りのFTを打つ。ところが候補リストは isOnCourt から引き直すので、
// 選択済みのシューターが下がると候補から消える。
//
// 1本目を打った後に離れた場合、成功分は本人に残り、残りは交代選手が打つ。
// この記録が持てるシューターは1人だけ（FoulRecord.shooterPlayerId）なので、
// 正確には表せない。黙って寄せず、ずれることを画面に出す。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FoulInputFlow } from './FoulInputFlow';
import { createPlayer } from '../../types/game';
import type { Player } from '../../types/game';

afterEach(cleanup);

const onCourt = (id: string, number: number, name: string): Player =>
    ({ ...createPlayer(id, number, name), isOnCourt: true });

function flow(opponentPlayers: Player[]) {
    return (
        <FoulInputFlow
            hasSelectedPlayer
            playerName="佐藤 花子"
            playerNumber={5}
            teamFouls={4}
            opponentTeamId="teamB"
            opponentTeamName="相手"
            opponentPlayers={opponentPlayers}
            onComplete={vi.fn()}
            onCancel={vi.fn()}
        />
    );
}

function renderFlow(opponentPlayers: Player[]) {
    const { rerender } = render(flow(opponentPlayers));
    /** 交代が起きた後の再描画。App から新しい opponentPlayers が降ってくる想定 */
    const substitute = (next: Player[]) => rerender(flow(next));
    return { substitute };
}

function tapPFoul() {
    fireEvent.keyDown(screen.getByText('パーソナルファウル').closest('button')!, { key: 'Enter' });
}

describe('シューターがコートを離れたとき', () => {
    it('シューター選択の段階なら「次へ」が押せなくなり、選び直しを促す', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        expect((screen.getByText('次へ') as HTMLButtonElement).disabled).toBe(false);

        // 負傷交代: 相手1 が下がり、交代選手が入る
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText(/シューターが交代でコートを離れました/)).toBeTruthy();
        expect((screen.getByText('次へ') as HTMLButtonElement).disabled).toBe(true);
        // 交代で入った選手が候補に並ぶ
        expect(screen.getByText('交代選手')).toBeTruthy();
    });

    it('FT未入力なら「シューターを選び直す」でシューター選択へ戻る', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText('シューターを選び直す')).toBeTruthy();
        // 個人成績がずれる旨の注意は、まだ1本も打っていないので出さない
        expect(screen.queryByText(/個人の得点とFT%が実際とずれます/)).toBeNull();

        fireEvent.click(screen.getByText('シューターを選び直す'));
        expect(screen.getByText('シューターを選択')).toBeTruthy();
    });

    it('FT入力済みなら、ずれる旨を出したうえで「記録」は押せる', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        // 2本とも入力しておく（記録が押せる状態にする）
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        fireEvent.click(screen.getAllByText('× 失敗')[1]);

        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        expect(screen.getByText(/個人の得点とFT%が実際とずれます/)).toBeTruthy();
        expect(screen.getByText('シューターを変更')).toBeTruthy();
        expect((screen.getByText('記録') as HTMLButtonElement).disabled).toBe(false);
    });

    it('「シューターを変更」で戻っても、入力済みのFT結果が消えない', () => {
        const injured = onCourt('b1', 10, '相手1');
        const bench = { ...createPlayer('b3', 12, '交代選手'), isOnCourt: false };
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        substitute([
            { ...injured, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);

        fireEvent.click(screen.getByText('シューターを変更'));
        fireEvent.click(screen.getByText('交代選手').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));

        // 1本目の成功が残っている（handleBack と違い結果を初期化しない）
        expect(screen.getByText('結果: 1/2 成功 (+1点)')).toBeTruthy();
        expect(screen.getByText('シューター: #12 交代選手')).toBeTruthy();

        // 差し替え前のシューターが打った1本が混ざったままなので、
        // この画面を「全部 #12 が打った」と読ませてはいけない
        const notice = screen.getByText(/途中でシューターを変更しました/);
        expect(notice.textContent).toContain('#10 相手1');
    });
});

/**
 * 途中でシューターを差し替えたときの告知。
 *
 * shooterLeftCourt に紐づけた告知は、交代選手を選んだ瞬間に消える。
 * すると「#12 交代選手」「入力済みのFT結果」だけが並ぶ真っさらな画面で
 * 記録を押すことになり、記録者が食い違いに気づく手がかりがどこにも無い。
 * 記録するまで出し続けて、試合後に手で補記する判断ができるようにする。
 */
describe('途中でシューターを変更したときの告知', () => {
    const injured = () => onCourt('b1', 10, '相手1');
    const benched = () => ({ ...createPlayer('b3', 12, '交代選手'), isOnCourt: false });

    /** 負傷交代（相手1 が下がり、交代選手が入る）まで進める */
    function goToInjurySubstitution(enteredFts: number) {
        const hurt = injured();
        const bench = benched();
        const { substitute } = renderFlow([hurt, onCourt('b2', 11, '相手2'), bench]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        for (let i = 0; i < enteredFts; i++) {
            fireEvent.click(screen.getAllByText('○ 成功')[i]);
        }
        substitute([
            { ...hurt, isOnCourt: false },
            onCourt('b2', 11, '相手2'),
            { ...bench, isOnCourt: true },
        ]);
    }

    it('FT入力済みで差し替えると、差し替え前のシューターを名指しして出続ける', () => {
        goToInjurySubstitution(1);

        fireEvent.click(screen.getByText('シューターを変更'));
        fireEvent.click(screen.getByText('交代選手').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));

        const notice = screen.getByText(/途中でシューターを変更しました/);
        expect(notice.textContent).toContain('#10 相手1');
        expect(notice.textContent).toContain('手で補記');
        // 差し替え後はコート上の選手なので、コートを離れた警告のほうは消えている
        expect(screen.queryByText(/シューターが交代でコートを離れました/)).toBeNull();
        // それでも記録は止めない
        fireEvent.click(screen.getAllByText('× 失敗')[1]);
        expect((screen.getByText('記録') as HTMLButtonElement).disabled).toBe(false);
        expect(screen.getByText(/途中でシューターを変更しました/)).toBeTruthy();
    });

    it('1本も入力しないうちに選び直した場合は出ない', () => {
        goToInjurySubstitution(0);

        fireEvent.click(screen.getByText('シューターを選び直す'));
        fireEvent.click(screen.getByText('交代選手').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));

        // 全部のFTを交代選手が打つので、食い違いは無い
        expect(screen.queryByText(/途中でシューターを変更しました/)).toBeNull();
    });

    it('「← 戻る」で入力済みのFTを捨てて入り直すと消える', () => {
        goToInjurySubstitution(1);

        fireEvent.click(screen.getByText('シューターを変更'));
        fireEvent.click(screen.getByText('交代選手').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        expect(screen.getByText(/途中でシューターを変更しました/)).toBeTruthy();

        // ftResult からの「← 戻る」は入力済みのFT結果を白紙に戻す。
        // 捨てた以上、食い違いを報せる相手も無い
        fireEvent.click(screen.getByText('← 戻る'));
        fireEvent.click(screen.getByText('交代選手').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));

        expect(screen.getByText('結果: 0/2 成功 (+0点)')).toBeTruthy();
        expect(screen.queryByText(/途中でシューターを変更しました/)).toBeNull();
    });

    it('同じシューターを選び直しただけなら出ない', () => {
        const hurt = injured();
        const { substitute } = renderFlow([hurt, onCourt('b2', 11, '相手2')]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        fireEvent.click(screen.getAllByText('○ 成功')[0]);
        // 一度下がって、すぐ戻ってきた（誤記録の訂正など）
        substitute([{ ...hurt, isOnCourt: false }, onCourt('b2', 11, '相手2')]);
        fireEvent.click(screen.getByText('シューターを変更'));
        substitute([hurt, onCourt('b2', 11, '相手2')]);
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));

        // 打ったのは終始 #10 相手1 なので、ずれていない
        expect(screen.queryByText(/途中でシューターを変更しました/)).toBeNull();
    });

    it('コートを離れてもシューター表示が空欄にならない', () => {
        const injured = onCourt('b1', 10, '相手1');
        const { substitute } = renderFlow([injured, onCourt('b2', 11, '相手2')]);

        tapPFoul();
        fireEvent.click(screen.getByText('相手1').closest('button')!);
        fireEvent.click(screen.getByText('次へ'));
        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();

        substitute([{ ...injured, isOnCourt: false }, onCourt('b2', 11, '相手2')]);

        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();
    });
});
