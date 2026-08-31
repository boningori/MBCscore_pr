// 履歴に「終わった試合」を1件流し込むフィクスチャ。
//
// E2E の費用のほとんどは「検査したい画面まで操作で辿り着くこと」に消える。
// このアプリは GameSetup の5ステップ → ラインナップ → 記録 → 試合終了を
// 通らないと履歴が1件も無い状態から抜けられない。そこを毎回操作でなぞると、
// スコアシートの検査のはずが実質セットアップウィザードの検査になってしまう。
//
// 履歴は localStorage の 1キーに素のJSONで載っているので（gameHistoryStorage.ts）、
// 読み込み前に注入して開始位置をスコアシートの手前まで進める。
// 型は src と共有しているので、Team/Player に項目が増えればここが型エラーになる。

import type { Page } from '@playwright/test';
import type { FoulEntry, FoulType, Player, ScoreEntry, ScoreType, Team } from '../../src/types/game';
import { createInitialGameInfo, createPlayer, createTeam } from '../../src/types/game';
import type { GameRecord } from '../../src/utils/gameHistoryStorage';
import type { SavedTeam } from '../../src/utils/teamStorage';

const HISTORY_KEY = 'minibasket-game-history';
const MY_TEAMS_KEY = 'minibasket-my-teams';

/** マイチームのid。記録側の teamA と結び付けて、選手スタッツ分析からも辿れる形にする */
const MY_TEAM_ID = 'my-team-e2e';

/** 得点種別ごとの点数（reducer の数え方と同じ） */
const POINTS: Record<ScoreType, number> = { '2P': 2, '3P': 3, FT: 1 };

type TeamId = 'teamA' | 'teamB';

interface ScoreEvent {
    team: TeamId;
    number: number;
    type: ScoreType;
    quarter: number;
}

interface FoulEvent {
    team: TeamId;
    number: number;
    quarter: number;
}

export const GAME_NAME = '第40回 市民大会 予選';
export const TEAM_A_NAME = 'あおぞらミニバス';
export const TEAM_B_NAME = 'みどりヶ丘ミニバス';

/** 記録の日時。ローカル時刻に落としても日付が変わらない時刻を選ぶ（CIはUTC） */
const GAME_DATE = '2026-08-15T10:00:00.000Z';

function buildPlayers(prefix: string, names: [number, string][]): Player[] {
    return names.map(([number, name], i) => ({
        ...createPlayer(`${prefix}-p${number}`, number, name, i === 0),
        // 5人とも各Qのスタメンとして出したことにする（出場欄が空だと様式が埋まらない）
        quartersPlayed: ['starter', 'starter', 'starter', 'starter'],
    }));
}

function buildTeam(id: TeamId, name: string, coach: string, players: Player[], color: 'white' | 'blue'): Team {
    return {
        ...createTeam(id, name, coach, ''),
        players,
        color,
        // 自チーム側だけ登録チームと結び付ける（相手側に入れない理由は Team.savedTeamId）
        ...(id === 'teamA' ? { isMyTeam: true, savedTeamId: MY_TEAM_ID } : {}),
    };
}

/**
 * 得点・ファウルの並びから、整合の取れた1試合を組み立てる。
 *
 * 選手スタッツ・ランニングスコア・チームファウルを手で書くと、スコアシートが
 * 読む3つの経路（stats合計 / scoreHistory / teamFouls）が食い違ったまま
 * テストが通ってしまう。ここで1つの並びから機械的に導く。
 */
function buildRecord(scores: ScoreEvent[], fouls: FoulEvent[]): GameRecord {
    const teamA = buildTeam('teamA', TEAM_A_NAME, '佐藤 太郎', buildPlayers('a', [
        [4, '田中 陽翔'], [5, '佐藤 蓮'], [6, '鈴木 大和'], [7, '高橋 湊'], [8, '伊藤 陽菜'],
    ]), 'white');
    const teamB = buildTeam('teamB', TEAM_B_NAME, '鈴木 花子', buildPlayers('b', [
        [4, '渡辺 悠真'], [5, '山本 結愛'], [6, '中村 律'], [7, '小林 芽依'], [8, '加藤 樹'],
    ]), 'blue');

    const teams: Record<TeamId, Team> = { teamA, teamB };
    const findPlayer = (team: TeamId, number: number): Player => {
        const player = teams[team].players.find(p => p.number === number);
        if (!player) throw new Error(`フィクスチャに #${number}（${team}）がいません`);
        return player;
    };

    // タイムスタンプは並び順を保つためだけのもの。実時刻に依存させない
    const baseTime = Date.parse(GAME_DATE);

    let runningA = 0;
    let runningB = 0;
    const scoreHistory: ScoreEntry[] = scores.map((event, i) => {
        const player = findPlayer(event.team, event.number);
        const points = POINTS[event.type];

        player.stats.points += points;
        if (event.type === '2P') {
            player.stats.twoPointMade += 1;
            player.stats.twoPointAttempt += 1;
        } else if (event.type === '3P') {
            player.stats.threePointMade += 1;
            player.stats.threePointAttempt += 1;
        } else {
            player.stats.freeThrowMade += 1;
            player.stats.freeThrowAttempt += 1;
        }

        if (event.team === 'teamA') runningA += points;
        else runningB += points;

        return {
            id: `score-${i}`,
            teamId: event.team,
            playerId: player.id,
            playerNumber: player.number,
            scoreType: event.type,
            points,
            quarter: event.quarter,
            timestamp: baseTime + i * 1000,
            runningScoreA: runningA,
            runningScoreB: runningB,
        };
    });

    const foulType: FoulType = 'P';
    const foulHistory: FoulEntry[] = fouls.map((event, i) => {
        const player = findPlayer(event.team, event.number);
        player.fouls.push({ type: foulType, freeThrows: 0 });
        teams[event.team].teamFouls[event.quarter - 1] += 1;

        return {
            id: `foul-${i}`,
            teamId: event.team,
            playerId: player.id,
            playerNumber: player.number,
            foulType,
            quarter: event.quarter,
            timestamp: baseTime + (scores.length + i) * 1000,
            isCoachOrBench: false,
        };
    });

    const sumPoints = (team: Team) => team.players.reduce((sum, p) => sum + p.stats.points, 0);

    return {
        id: 'game-e2e-fixture',
        date: GAME_DATE,
        gameName: GAME_NAME,
        teamA,
        teamB,
        finalScore: { teamA: sumPoints(teamA), teamB: sumPoints(teamB) },
        scoreHistory,
        statHistory: [],
        foulHistory,
        gameInfo: { ...createInitialGameInfo(), venue: '市立総合体育館', scorer: '記録 一郎' },
        showThreePoint: true,
        quarterMinutes: 6,
        endTime: '2026-08-15T11:20:00.000Z',
        createdAt: GAME_DATE,
    };
}

export const FINISHED_GAME: GameRecord = buildRecord(
    [
        { team: 'teamA', number: 4, type: '2P', quarter: 1 },
        { team: 'teamA', number: 5, type: '2P', quarter: 1 },
        { team: 'teamB', number: 4, type: '2P', quarter: 1 },
        { team: 'teamA', number: 6, type: '3P', quarter: 2 },
        { team: 'teamA', number: 4, type: 'FT', quarter: 2 },
        { team: 'teamB', number: 5, type: '2P', quarter: 2 },
        { team: 'teamB', number: 6, type: '2P', quarter: 2 },
        { team: 'teamA', number: 4, type: '2P', quarter: 3 },
        { team: 'teamB', number: 4, type: '2P', quarter: 3 },
        { team: 'teamB', number: 7, type: '3P', quarter: 3 },
        { team: 'teamA', number: 5, type: '2P', quarter: 4 },
        { team: 'teamA', number: 7, type: '2P', quarter: 4 },
        { team: 'teamA', number: 4, type: 'FT', quarter: 4 },
        { team: 'teamB', number: 5, type: '2P', quarter: 4 },
    ],
    [
        { team: 'teamA', number: 4, quarter: 1 },
        { team: 'teamB', number: 5, quarter: 2 },
        { team: 'teamA', number: 4, quarter: 3 },
    ],
);

/**
 * 記録側のチームから、登録済みマイチームを起こす。
 *
 * ホームは「マイチームが1件も無ければメニューを出さず登録案内だけを出す」
 * （Home.tsx の hasMyTeams）。履歴だけ入れても試合履歴へ進めないので、
 * 実際の利用者と同じ前提を揃える。
 */
function toSavedTeam(team: Team): SavedTeam {
    return {
        id: MY_TEAM_ID,
        name: team.name,
        coachName: team.coachName,
        assistantCoachName: team.assistantCoachName,
        players: team.players.map(p => ({
            number: p.number,
            name: p.name,
            isCaptain: p.isCaptain,
        })),
        createdAt: GAME_DATE,
        updatedAt: GAME_DATE,
    };
}

/**
 * 履歴に試合を1件持つ利用者の状態でアプリを開けるようにする（page.goto の前に呼ぶ）。
 *
 * localStorage は addInitScript で毎回のページ読み込み前に入れる。goto の後に
 * 書くと、Reactが既に空の状態で描き終えている
 */
export async function seedRecordedGame(page: Page, record: GameRecord = FINISHED_GAME): Promise<void> {
    await page.addInitScript(
        (entries: [string, string][]) => {
            for (const [key, value] of entries) window.localStorage.setItem(key, value);
        },
        [
            [HISTORY_KEY, JSON.stringify([record])],
            [MY_TEAMS_KEY, JSON.stringify([toSavedTeam(record.teamA)])],
        ] as [string, string][],
    );
}
