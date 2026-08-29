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

/**
 * 中断ブロックのボタンをアクセシブル名で引く。
 * ⏱ / 🔄 は aria-hidden なので、テキスト検索では掴めない
 */
function interruptBtn(name: string) {
    return screen.getByRole('button', { name });
}

function queryInterruptBtn(name: string) {
    return screen.queryByRole('button', { name });
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
        expect(interruptBtn('タイムアウト')).toBeTruthy();
        expect(interruptBtn('選手交代')).toBeTruthy();
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
        expect(queryInterruptBtn('タイムアウト')).toBeNull();
        expect(interruptBtn('選手交代')).toBeTruthy();
    });
});

describe('中断ブロック: チーム選択', () => {
    it('タイムアウトを押すと同じ行がチーム選択に入れ替わる', () => {
        renderFlow();
        goToFtResult();
        fireEvent.click(interruptBtn('タイムアウト'));

        expect(screen.getByText('タイムアウトを記録するチーム')).toBeTruthy();
        expect(screen.getByText('東京中')).toBeTruthy();
        expect(screen.getByText('大阪中')).toBeTruthy();
        // 入れ替わりなので元のボタンは消える
        expect(queryInterruptBtn('タイムアウト')).toBeNull();
        expect(queryInterruptBtn('選手交代')).toBeNull();
    });

    it('チームを押すと onRequestTimeout がそのチームIDで呼ばれ、初期状態に戻る', () => {
        const { onRequestTimeout } = renderFlow();
        goToFtResult();
        fireEvent.click(interruptBtn('タイムアウト'));
        fireEvent.click(screen.getByText('大阪中'));

        expect(onRequestTimeout).toHaveBeenCalledWith('teamB');
        expect(interruptBtn('タイムアウト')).toBeTruthy();
    });

    it('交代も同じようにチームを選んで onRequestSubstitution が呼ばれる', () => {
        const { onRequestSubstitution } = renderFlow();
        goToFtResult();
        fireEvent.click(interruptBtn('選手交代'));

        expect(screen.getByText('選手交代をするチーム')).toBeTruthy();
        fireEvent.click(screen.getByText('東京中'));
        expect(onRequestSubstitution).toHaveBeenCalledWith('teamA');
    });

    it('FT結果を入れた後にタイムアウトを要求しても、入力とステップが残る', () => {
        const { onRequestTimeout } = renderFlow();
        goToFtResult();
        const madeButtons = screen.getAllByText('○ 成功');
        fireEvent.click(madeButtons[0]);
        // 全部埋まるまで合計欄は成否を出さないので、入力済みかは各行のボタンで見る
        expect(screen.getAllByRole('button', { pressed: true }).map(b => b.textContent))
            .toEqual(['○ 成功']);

        fireEvent.click(interruptBtn('タイムアウト'));
        fireEvent.click(screen.getByText('東京中'));

        expect(onRequestTimeout).toHaveBeenCalledWith('teamA');
        // FT結果入力のまま、入れた1本目も残っている
        expect(screen.getAllByRole('button', { pressed: true }).map(b => b.textContent))
            .toEqual(['○ 成功']);
        expect(screen.getByText('シューター: #10 相手1')).toBeTruthy();
    });

    it('チーム選択のまとまりに、何のチームを選ぶのかの見出しが付く', () => {
        renderFlow();
        goToFtResult();
        fireEvent.click(interruptBtn('タイムアウト'));

        const group = screen.getByRole('group', { name: 'タイムアウトを記録するチーム' });
        expect(group).toBeTruthy();
        // チーム名だけのボタン名だと、押すと何が起きるのか読み上げでは分からない
        expect(screen.getByRole('button', { name: '東京中のタイムアウトを記録' })).toBeTruthy();

        fireEvent.click(screen.getByText('選択をやめる'));
        fireEvent.click(interruptBtn('選手交代'));
        expect(screen.getByRole('group', { name: '選手交代をするチーム' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '東京中の選手交代' })).toBeTruthy();
    });
});

describe('中断ブロック: 安全弁', () => {
    it('タイムアウト使用済みのチームは押しても何も起きず「済」が出る', () => {
        const { onRequestTimeout } = renderFlow({
            interruptTeams: [
                { id: 'teamA', name: '東京中', timeoutUsed: true },
                { id: 'teamB', name: '大阪中', timeoutUsed: false },
            ],
        });
        goToFtResult();
        fireEvent.click(interruptBtn('タイムアウト'));

        const used = screen.getByText('東京中（済）').closest('button')! as HTMLButtonElement;
        // disabled にすると支援技術から辿れず「済」であることを知れないので、
        // 押せるまま何も起きない状態にしてある
        expect(used.disabled).toBe(false);
        expect(used.getAttribute('aria-disabled')).toBe('true');
        expect(used.getAttribute('aria-label')).toContain('記録済み');
        fireEvent.click(used);
        expect(onRequestTimeout).not.toHaveBeenCalled();
        // 押しても行は入れ替わらない
        expect(screen.getByText('タイムアウトを記録するチーム')).toBeTruthy();
    });

    it('使用済みでも交代のチーム選択では押せる', () => {
        const { onRequestSubstitution } = renderFlow({
            interruptTeams: [
                { id: 'teamA', name: '東京中', timeoutUsed: true },
                { id: 'teamB', name: '大阪中', timeoutUsed: false },
            ],
        });
        goToFtResult();
        fireEvent.click(interruptBtn('選手交代'));

        fireEvent.click(screen.getByText('東京中'));
        expect(onRequestSubstitution).toHaveBeenCalledWith('teamA');
    });

    it('「選択をやめる」で初期状態に戻る', () => {
        const { onRequestTimeout } = renderFlow();
        goToFtResult();
        fireEvent.click(interruptBtn('タイムアウト'));
        // すぐ下の「キャンセル」（入力途中のファウルを丸ごと捨てる）と
        // 読み分けられる名前になっている
        expect(screen.queryByText('やめる')).toBeNull();
        fireEvent.click(screen.getByText('選択をやめる'));

        expect(interruptBtn('タイムアウト')).toBeTruthy();
        expect(screen.queryByText('タイムアウトを記録するチーム')).toBeNull();
        expect(onRequestTimeout).not.toHaveBeenCalled();
    });

    it('チーム選択中のEscapeは、ステップを戻さずチーム選択だけを閉じる', () => {
        renderFlow();
        goToFtResult();
        fireEvent.click(interruptBtn('タイムアウト'));

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        // FT結果入力のまま。チーム選択だけが閉じる
        expect(screen.getByText('フリースロー結果を入力')).toBeTruthy();
        expect(screen.queryByText('タイムアウトを記録するチーム')).toBeNull();
        expect(interruptBtn('タイムアウト')).toBeTruthy();
    });

    it('チーム選択を閉じた後のEscapeは従来どおりシューター選択へ戻る', () => {
        renderFlow();
        goToFtResult();
        fireEvent.click(interruptBtn('タイムアウト'));
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(screen.getByText('シューターを選択')).toBeTruthy();
    });

    it('チーム選択を開いたまま戻っても、次に開いたときは選択肢から始まる', () => {
        renderFlow();
        tapPFoul();
        selectShooter();
        fireEvent.click(interruptBtn('タイムアウト'));

        // チーム選択が開いている状態での「← 戻る」。以前はここで
        // シューター選択ごと巻き戻り、interruptChoice だけが残っていた
        fireEvent.click(screen.getByText('← 戻る'));
        expect(interruptBtn('タイムアウト')).toBeTruthy();

        // もう一度戻ってファウル種類選択まで抜け、入り直す
        fireEvent.click(screen.getByText('← 戻る'));
        expect(screen.getByText('ファウル種類を選択')).toBeTruthy();
        tapPFoul();
        selectShooter();

        // 2周目もタイムアウト/交代の選択肢から始まる（チーム選択が居座らない）
        expect(interruptBtn('タイムアウト')).toBeTruthy();
        expect(screen.queryByText('タイムアウトを記録するチーム')).toBeNull();
    });
});

describe('中断ブロック: ステップが変わったらチーム選択を閉じる', () => {
    it('チーム選択を開いたまま「次へ」を押すと、FT結果入力に居座らない', () => {
        renderFlow();
        tapPFoul();
        selectShooter();
        fireEvent.click(interruptBtn('タイムアウト'));
        expect(screen.getByText('タイムアウトを記録するチーム')).toBeTruthy();

        fireEvent.click(screen.getByText('次へ'));

        expect(screen.getByText('フリースロー結果を入力')).toBeTruthy();
        expect(screen.queryByText('タイムアウトを記録するチーム')).toBeNull();
        expect(interruptBtn('タイムアウト')).toBeTruthy();
    });

    it('チーム選択を開いたまま「シューターを選び直す」を押しても居座らない', () => {
        const injured = { ...createPlayer('b1', 10, '相手1'), isOnCourt: true };
        const { rerender } = render(
            <FoulInputFlow
                hasSelectedPlayer
                playerName="佐藤 花子"
                playerNumber={5}
                teamFouls={4}
                opponentTeamId="teamB"
                opponentTeamName="相手"
                opponentPlayers={[injured, OPPONENTS[1]]}
                interruptTeams={TEAMS}
                onRequestTimeout={vi.fn()}
                onRequestSubstitution={vi.fn()}
                onComplete={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        goToFtResult();
        // シューターが下がると「シューターを選び直す」が出る
        rerender(
            <FoulInputFlow
                hasSelectedPlayer
                playerName="佐藤 花子"
                playerNumber={5}
                teamFouls={4}
                opponentTeamId="teamB"
                opponentTeamName="相手"
                opponentPlayers={[{ ...injured, isOnCourt: false }, OPPONENTS[1]]}
                interruptTeams={TEAMS}
                onRequestTimeout={vi.fn()}
                onRequestSubstitution={vi.fn()}
                onComplete={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        fireEvent.click(interruptBtn('選手交代'));
        expect(screen.getByText('選手交代をするチーム')).toBeTruthy();

        fireEvent.click(screen.getByText('シューターを選び直す'));

        expect(screen.getByText('シューターを選択')).toBeTruthy();
        expect(screen.queryByText('選手交代をするチーム')).toBeNull();
    });
});

describe('中断ブロック: フォーカス', () => {
    // Modal の Escape とフォーカストラップはオーバーレイの onKeyDown なので、
    // フォーカスがダイアログの外へ落ちるとEscapeが効かず、Tabが暗幕の下へ抜ける
    it('チーム選択に入れ替わってもフォーカスがダイアログ内に残る', () => {
        renderFlow();
        goToFtResult();
        const dialog = screen.getByRole('dialog');

        fireEvent.click(interruptBtn('タイムアウト'));

        expect(dialog.contains(document.activeElement)).toBe(true);
        expect(document.activeElement).not.toBe(document.body);
    });

    it('チーム選択を閉じたときもフォーカスがダイアログ内に残る', () => {
        renderFlow();
        goToFtResult();
        const dialog = screen.getByRole('dialog');

        fireEvent.click(interruptBtn('タイムアウト'));
        fireEvent.click(screen.getByText('選択をやめる'));

        expect(dialog.contains(document.activeElement)).toBe(true);
        expect(document.activeElement).not.toBe(document.body);
    });
});
