// App レベルで交代そのものを主題にしたテストが無かった。
// 一括交代は onSubstitute を人数分呼ぶ作りなので、その展開が
// 実際に reducer まで届いてコート上の5人が入れ替わることを通しで確かめる
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';
import type { SavedTeam } from './utils/teamStorage';

function makeTeam(id: string, name: string, label: string, startNumber: number, count: number): SavedTeam {
    return {
        id,
        name,
        coachName: 'コーチ',
        assistantCoachName: '',
        players: Array.from({ length: count }, (_, i) => ({
            number: startNumber + i,
            name: `${label}${i + 1}`,
            isCaptain: i === 0,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

// 9人にしておく。10人にすると `ホーム1` が `ホーム10` にも部分一致して
// getByRole が「複数見つかった」で落ちる
const myTeam = makeTeam('team-1', 'ホームチーム', 'ホーム', 4, 9);
const opponentTeam = makeTeam('team-2', 'アウェイチーム', 'アウェイ', 20, 5);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('minibasket-my-teams', JSON.stringify([myTeam]));
    localStorage.setItem('minibasket-opponent-teams', JSON.stringify([opponentTeam]));
    sessionStorage.setItem('mbc-restore-dismissed', '1');
});

afterEach(cleanup);

/** 試合設定ウィザードを進めてQ1を開始する */
async function startGame() {
    fireEvent.click(await screen.findByText('新規試合開始'));

    await screen.findByText('基本情報');
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    await screen.findByText('マイチーム選択');
    fireEvent.click(screen.getByText('ホームチーム'));

    await screen.findByText('出場選手確認');
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    await screen.findByText('対戦チームを選択');
    fireEvent.click(screen.getByText('アウェイチーム'));

    await screen.findByText('設定確認');
    fireEvent.click(screen.getByRole('button', { name: 'スタメン選択へ' }));
    await screen.findByText('スタメン選択');

    // 白: ホーム1〜5、青: アウェイ1〜5 をスタメンにする
    for (const label of ['ホーム', 'アウェイ']) {
        if (label === 'アウェイ') {
            fireEvent.click(screen.getByRole('tab', { name: /青/ }));
        }
        for (let n = 1; n <= 5; n++) {
            fireEvent.click(screen.getByRole('button', { name: new RegExp(`${label}${n}`) }));
        }
    }
    fireEvent.click(screen.getByRole('button', { name: '試合開始' }));
    await waitFor(() => {
        expect(document.querySelector('.team-panel.team-a .mini-player-card')).toBeTruthy();
    });
}

describe('App: 複数人の一括交代', () => {
    it('3人まとめて交代すると、コート上の5人が正しく入れ替わる', async () => {
        const { container } = render(<App />);
        await startGame();

        // 自チームの交代モーダルを開く
        fireEvent.click(screen.getAllByRole('button', { name: /交代/ })[0]);
        await screen.findByText(/選手交代/);

        // モーダル内に絞る。コート上の選手（ホーム1〜3）はモーダルの外の
        // team-panel にも同じ名前のボタンがあり、screen だけで探すと
        // 「複数見つかった」で落ちる
        const modal = screen.getByRole('dialog');

        // コートから3人、ベンチから3人
        for (const name of ['ホーム1', 'ホーム2', 'ホーム3', 'ホーム6', 'ホーム7', 'ホーム8']) {
            fireEvent.click(within(modal).getByRole('button', { name: new RegExp(name) }));
        }

        const confirm = within(modal).getByRole('button', { name: '交代実行' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);

        // 案内が3人分をまとめて伝える
        expect(document.querySelector('.substitution-note-sub')?.textContent)
            .toContain('3人交代しました');

        fireEvent.click(within(modal).getByRole('button', { name: '完了' }));

        // コート上は5人のまま。入った3人が居て、下がった3人は居ない
        await waitFor(() => {
            expect(container.querySelectorAll('.team-panel.team-a .mini-player-card').length).toBe(5);
        });
        const courtText = container.querySelector('.team-panel.team-a')!.textContent ?? '';
        for (const stillIn of ['ホーム4', 'ホーム5', 'ホーム6', 'ホーム7', 'ホーム8']) {
            expect(courtText).toContain(stillIn);
        }
        for (const out of ['ホーム1', 'ホーム2', 'ホーム3']) {
            expect(courtText).not.toContain(out);
        }
    });

    // 設計書は「入った選手の quartersPlayed[今のQ] が sub（同じQに一度出ていた
    // 選手が戻る場合は both）になること」も約束していたが、上のテストは
    // isOnCourt の入れ替わりしか見ていない。quartersPlayed は公式様式の
    // 出場欄（RunningScoresheet の cell-quarter）に ／＼× として印字されるが、
    // isOnCourt には出ないため、ここが崩れても既存テストは気づけない。
    // 1回の一括交代の中に sub の選手（初めての途中出場）と both の選手
    // （同じQに二度目の出場）が混ざる組み合わせは、リポジトリのどこにも無かった
    it('一括交代でも quartersPlayed が正しく更新される（sub と both が混ざる組み合わせ）', async () => {
        const { container } = render(<App />);
        await startGame();

        fireEvent.click(screen.getAllByRole('button', { name: /交代/ })[0]);
        await screen.findByText(/選手交代/);
        const modal = screen.getByRole('dialog');

        // 1組だけ実行: ホーム1を下げてホーム6を入れる → ホーム6は初めての
        // 途中出場なので「sub」になる
        fireEvent.click(within(modal).getByRole('button', { name: /ホーム1/ }));
        fireEvent.click(within(modal).getByRole('button', { name: /ホーム6/ }));
        fireEvent.click(within(modal).getByRole('button', { name: '交代実行' }));

        // 続けて2組を一括で実行する。
        // ・ホーム6を下げてホーム1を戻す → ホーム1はこのQにスタメンで出て、
        //   退いて、また入ったので「both」になる
        // ・同時にホーム2を下げてホーム7を入れる → ホーム7は初めての
        //   途中出場なので「sub」になる
        fireEvent.click(within(modal).getByRole('button', { name: /ホーム6/ }));
        fireEvent.click(within(modal).getByRole('button', { name: /ホーム1/ }));
        fireEvent.click(within(modal).getByRole('button', { name: /ホーム2/ }));
        fireEvent.click(within(modal).getByRole('button', { name: /ホーム7/ }));
        fireEvent.click(within(modal).getByRole('button', { name: '交代実行' }));

        fireEvent.click(within(modal).getByRole('button', { name: '完了' }));

        // スコアシート画面の出場欄（1Q列）で確かめる。RunningScoresheet.tsx の
        // renderPlayerRow を読んで確認済み: quartersPlayed[q-1] の値に応じて
        // 該当する .cell-quarter に slash-starter / slash-sub / slash-both が付く
        fireEvent.click(screen.getByRole('button', { name: 'スコアシート' }));
        await screen.findAllByText(/出場時限/);

        const quarterMarks = (name: string) => {
            const nameCell = [...container.querySelectorAll('.cell-name')]
                .find(td => td.textContent === name);
            if (!nameCell) throw new Error(`row not found: ${name}`);
            return [...nameCell.closest('tr')!.querySelectorAll('.cell-quarter')]
                .map(td => td.className);
        };

        // ホーム1: スタメンで出て、退いて、また入った → both（×表示）
        expect(quarterMarks('ホーム1')[0]).toContain('slash-both');
        // ホーム7: 初めての途中出場 → sub（＼表示）
        expect(quarterMarks('ホーム7')[0]).toContain('slash-sub');
        // ホーム6: 途中出場のまま退いた（退出そのものでは印は変わらない）→ sub のまま
        expect(quarterMarks('ホーム6')[0]).toContain('slash-sub');
        // ホーム2: スタメンで出て退いただけ（再出場していない）→ starter のまま
        expect(quarterMarks('ホーム2')[0]).toContain('slash-starter');
    });
});
