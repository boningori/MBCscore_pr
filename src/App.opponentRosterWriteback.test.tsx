// 試合中に相手チームへ足した選手は、その試合にしか残らない。
// 試合終了・保存の直後に、対戦チームの名簿へ取り込むか尋ねる。
//
// 相手チームは名前でしか登録レコードと結び付けられないので、
// 一意に決まるときだけ尋ねる（同名が2件・見つからないときは尋ねない）。
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { createInitialGame, createTeam, createPlayer, MAX_PLAYERS_PER_TEAM } from './types/game';
import { loadOpponents, loadRecentOpponents } from './utils/teamStorage';
import type { SavedTeam } from './utils/teamStorage';

// 保存先のキーは定数名と交差している。直に触らず、この2つのキーを使う
// （minibasket-saved-opponents = 登録一覧、minibasket-opponent-teams = 直近履歴）
const REGISTRY_KEY = 'minibasket-saved-opponents';
const RECENT_KEY = 'minibasket-opponent-teams';

function savedOpponent(id: string, name: string, numbers: number[]): SavedTeam {
    return {
        id,
        name,
        coachName: '相手コーチ',
        assistantCoachName: '',
        players: numbers.map(n => ({ number: n, name: `相手${n}`, isCaptain: false })),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

/**
 * 試合終了直後（保存待ち）の中断セッションを仕込む。
 * 相手チームには保存済みの名簿に無い #99 が居る＝この試合で追加された選手
 */
function seedFinishedSession(opponentNumbers: number[] = [10, 99]) {
    const game = createInitialGame();
    game.phase = 'finished';
    game.currentQuarter = 4;
    game.teamA = {
        ...createTeam('teamA', 'ホームチーム', 'コーチ'),
        isMyTeam: true,
        players: [{ ...createPlayer('teamA-player-0', 4, 'ホーム1'), isOnCourt: true }],
    };
    game.teamB = {
        ...createTeam('teamB', '相手チーム', '相手コーチ'),
        isMyTeam: false,
        players: opponentNumbers.map((n, i) => ({
            ...createPlayer(`teamB-player-${i}`, n, `相手${n}`),
            isOnCourt: i === 0,
        })),
    };
    localStorage.setItem('minibasket-game-session', JSON.stringify({
        game, gameName: '決勝戦', date: '2026-09-07', savedAt: new Date().toISOString(),
    }));
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('mbc-restore-dismissed', '1');
    // マイチームが1つも無いと Home はメニューを出さず「まずマイチームを
    // 登録してください」の案内になる（Home.tsx の hasMyTeams）。
    // 「試合結果を保存」に辿り着けないので必ず仕込む
    localStorage.setItem('minibasket-my-teams', JSON.stringify([{
        id: 'team-1',
        name: 'ホームチーム',
        coachName: 'コーチ',
        assistantCoachName: '',
        players: [{ number: 4, name: 'ホーム1', isCaptain: true }],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    }]));
    // 試合を保存すると履歴が1件増え、バックアップ未記録なら isBackupDue() が
    // 真になる。督促は画面ごと差し替える早期returnなので、素のままだと
    // ホーム画面の表明が落ちる。既にバックアップ済みということにして黙らせる
    // （順序そのものは専用のテストで確かめる）
    localStorage.setItem('minibasket-last-backup', JSON.stringify({ timestamp: Date.now(), gameCount: 99 }));
});

afterEach(cleanup);

/** ホーム →「試合結果を保存」→「保存して終了」まで進める */
async function finishGame() {
    render(<App />);
    fireEvent.click(await screen.findByText('試合結果を保存'));
    fireEvent.click(await screen.findByText('保存して終了'));
}

describe('App: 追加した相手選手を名簿へ取り込む', () => {
    it('登録一覧と直近履歴の両方に一致したら、両方に登録される', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10])]));
        localStorage.setItem(RECENT_KEY, JSON.stringify([savedOpponent('r1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        expect(await screen.findByText('相手チームの名簿に登録しますか？')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '登録する' }));

        // 登録成功のトーストが出ること（消えても誰も気づかないため表明する）
        expect(await screen.findByText('「相手チーム」の名簿に1人を登録しました')).toBeTruthy();

        await waitFor(() => {
            expect(loadOpponents()[0].players.map(p => p.number)).toEqual([10, 99]);
        });
        expect(loadRecentOpponents()[0].players.map(p => p.number)).toEqual([10, 99]);
        // id を保つ＝新しいレコードを増やさない
        expect(loadOpponents()).toHaveLength(1);
        expect(loadRecentOpponents()).toHaveLength(1);
    });

    it('「登録しない」を選ぶと名簿は変わらない', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        fireEvent.click(await screen.findByRole('button', { name: '登録しない' }));

        await waitFor(() => {
            expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
        });
        expect(loadOpponents()[0].players.map(p => p.number)).toEqual([10]);
    });

    it('追加された選手がいなければ尋ねない', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10, 99])]));
        seedFinishedSession();

        await finishGame();

        await waitFor(() => {
            expect(screen.getByText('新規試合開始')).toBeTruthy();
        });
        expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
    });

    it('同名の相手チームが2件あるときは尋ねない（どちらに入れるか決められない）', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([
            savedOpponent('o1', '相手チーム', [10]),
            savedOpponent('o2', '相手チーム', [10]),
        ]));
        seedFinishedSession();

        await finishGame();

        await waitFor(() => {
            expect(screen.getByText('新規試合開始')).toBeTruthy();
        });
        expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
        expect(loadOpponents().every(t => t.players.length === 1)).toBe(true);
    });

    it('登録一覧に無ければ、直近履歴に一致があっても尋ねない', async () => {
        // 本番で実際に起きる形。直近履歴は試合開始のたびに書かれる
        // （App.tsx の handleGameSetupComplete）ので、そこに一致することは
        // 「登録されている」証拠にならない
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '旧チーム名', [10])]));
        localStorage.setItem(RECENT_KEY, JSON.stringify([savedOpponent('r1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        await waitFor(() => {
            expect(screen.getByText('新規試合開始')).toBeTruthy();
        });
        expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
    });

    it('追加する選手の背番号と名前、登録先のチーム名を出す', async () => {
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toContain('#99 相手99');
        expect(dialog.textContent).toContain('相手チーム');
        // 15人を超えないときは、あふれ案内を出さない
        expect(dialog.textContent).not.toContain('印字されません');
    });

    it('登録後に15人を超えると、印字されない旨の案内が出る', async () => {
        // 登録一覧に MAX_PLAYERS_PER_TEAM 人（背番号1〜15）を仕込み、試合の名簿は
        // それに16人目（#99）を足した状態にする。登録後は16人になり、
        // スコアシートの選手欄（15人分）に印字されない選手が出る
        const registryNumbers = Array.from({ length: MAX_PLAYERS_PER_TEAM }, (_, i) => i + 1);
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', registryNumbers)]));
        seedFinishedSession([...registryNumbers, 99]);

        await finishGame();

        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toContain(
            `登録すると${MAX_PLAYERS_PER_TEAM + 1}人になります。スコアシートの選手欄は${MAX_PLAYERS_PER_TEAM}人分で、背番号順に先頭${MAX_PLAYERS_PER_TEAM}人までしか印字されません。`
        );
    });

    // バックアップ督促は画面ごと差し替える早期return。取り込みダイアログと
    // 同時に立てると、ダイアログが一度も出ないまま消える
    it('取り込みダイアログを閉じてからバックアップ督促が出る', async () => {
        // 督促を黙らせる仕込みを外す＝保存後に督促が要る状態にする
        localStorage.removeItem('minibasket-last-backup');
        localStorage.setItem(REGISTRY_KEY, JSON.stringify([savedOpponent('o1', '相手チーム', [10])]));
        seedFinishedSession();

        await finishGame();

        // まず取り込みダイアログ。督促に押しつぶされていない
        expect(await screen.findByText('相手チームの名簿に登録しますか？')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: '登録する' }));

        // 閉じた後に督促が出る
        await waitFor(() => {
            expect(screen.queryByText('相手チームの名簿に登録しますか？')).toBeNull();
        });
        expect(await screen.findByText(/バックアップしますか/)).toBeTruthy();
    });
});
