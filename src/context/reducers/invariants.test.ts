// 記録エンジンの横断的な不変条件を、ランダムな操作列に対して検査する。
//
// これまで見つかった不具合は、単体では正しい処理どうしの組み合わせで起きていた
// （「選手不明」の記録を得点へ変換するとスコアボードとスコアシートが食い違う、
// ファウル取り消しが無関係な得点を巻き込む、付け替えで様式の並びが入れ替わる）。
// 個々のケースを狙い撃つテストとは別に、long な操作列を流して「どの時点でも
// 成り立っていなければならないこと」を検査する網を置く。
//
// seed 固定なので失敗は再現できる。破れたときは直近の操作列も出す。
//
// 注意: reducer は FT の得点エントリに now+1..now+3 の未来時刻を振る。
// 1ms未満で連続実行すると並びが人為的に壊れるため、実際のタップ間隔を
// 偽クロックで模している。

import { describe, it, expect, afterEach, vi } from 'vitest';
import { gameReducer } from './index';
import { createInitialGame, createPlayer, createTeam } from '../../types/game';
import type { Game, GameAction } from '../../types/game';
import { createPendingAction } from '../../types/pendingAction';

function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function makeGame(): Game {
    const g = createInitialGame();
    const a = createTeam('teamA', 'ホーム', 'C');
    const b = createTeam('teamB', 'アウェイ', 'C');
    a.players = Array.from({ length: 9 }, (_, i) => ({ ...createPlayer('a' + i, 4 + i, 'A' + i), isOnCourt: i < 5 }));
    b.players = Array.from({ length: 9 }, (_, i) => ({ ...createPlayer('b' + i, 20 + i, 'B' + i), isOnCourt: i < 5 }));
    return { ...g, teamA: a, teamB: b, phase: 'playing' };
}

const teamPoints = (g: Game, t: 'teamA' | 'teamB') => g[t].players.reduce((s, p) => s + p.stats.points, 0);
const historyPoints = (g: Game, t: 'teamA' | 'teamB') =>
    g.scoreHistory.filter(s => s.teamId === t).reduce((s, e) => s + e.points, 0);

/** 破れた不変条件を返す（すべて満たしていれば null） */
function findViolation(g: Game): string | null {
    for (const t of ['teamA', 'teamB'] as const) {
        // スコアボード（選手合計）とスコアシート（得点履歴）が一致する
        if (teamPoints(g, t) !== historyPoints(g, t)) {
            return `${t}: ボード=${teamPoints(g, t)} シート=${historyPoints(g, t)}`;
        }

        // ランニングスコアが累計と一致し、重複しない
        const entries = g.scoreHistory
            .filter(s => s.teamId === t)
            .slice()
            .sort((x, y) => x.timestamp - y.timestamp);
        let acc = 0;
        const seen = new Set<number>();
        for (const e of entries) {
            acc += e.points;
            const run = t === 'teamA' ? e.runningScoreA : e.runningScoreB;
            if (run !== acc) return `${t}: runningScore=${run} 期待=${acc}`;
            if (seen.has(run)) return `${t}: runningScore重複=${run}`;
            seen.add(run);
        }

        // Q1〜Q3のチームファウルは、その期の通常ファウル数と一致する
        // （Q4以降はOT欄へ通算されるため別ルール。ここでは検査しない）
        for (const q of [1, 2, 3]) {
            const counted = g.foulHistory.filter(f =>
                f.teamId === t && f.quarter === q && !f.isCoachOrBench && f.coachFoulTarget !== 'BENCH').length;
            const stored = g[t].teamFouls[q - 1] ?? 0;
            if (stored !== counted) return `${t} Q${q}: teamFouls=${stored} 履歴=${counted}`;
        }

        for (const p of g[t].players) {
            const s = p.stats;
            for (const [k, v] of Object.entries(s)) {
                if ((v as number) < 0) return `${p.id}: ${k}が負(${v})`;
            }
            if (s.twoPointMade > s.twoPointAttempt) return `${p.id}: 2P成功>試投`;
            if (s.threePointMade > s.threePointAttempt) return `${p.id}: 3P成功>試投`;
            if (s.freeThrowMade > s.freeThrowAttempt) return `${p.id}: FT成功>試投`;

            // 選手のファウル欄と履歴の件数が一致する
            const fromHistory = g.foulHistory.filter(f => f.playerId === p.id && !f.isCoachOrBench).length;
            if (p.fouls.length !== fromHistory) {
                return `${p.id}: fouls=${p.fouls.length} 履歴=${fromHistory}`;
            }

            // 得点は個々のスタッツから導ける（オウンゴールはシュート成績に入らない）
            const og = g.scoreHistory
                .filter(e => e.playerId === p.id && e.isOwnGoal)
                .reduce((sum, e) => sum + e.points, 0);
            const derived = s.twoPointMade * 2 + s.threePointMade * 3 + s.freeThrowMade + og;
            if (s.points !== derived) return `${p.id}: points=${s.points} 導出=${derived}`;
        }
    }
    return null;
}

/** 1シードぶんの疑似試合。破れたらメッセージ、通れば null */
function runGame(seed: number, steps: number): string | null {
    const rand = rng(seed);
    let g = makeGame();
    const pick = function <T>(xs: T[]): T {
        return xs[Math.floor(rand() * xs.length)];
    };

    let clock = new Date('2026-08-18T10:00:00Z').getTime();
    vi.setSystemTime(clock);
    const trace: string[] = [];

    for (let i = 0; i < steps; i++) {
        const teamId = pick(['teamA', 'teamB'] as const);
        const team = g[teamId];
        const onCourt = team.players.filter(p => p.isOnCourt);
        if (onCourt.length === 0) continue;
        const player = pick(onCourt);
        const oppId = teamId === 'teamA' ? 'teamB' : 'teamA';
        const oppOnCourt = g[oppId].players.filter(p => p.isOnCourt);
        const r = rand();
        let action: GameAction | null = null;

        if (r < 0.18) {
            action = { type: 'ADD_SCORE', payload: { teamId, playerId: player.id, scoreType: pick(['2P', '3P', 'FT'] as const) } };
        } else if (r < 0.30) {
            action = { type: 'ADD_STAT', payload: { teamId, playerId: player.id, statType: pick(['OREB', 'DREB', 'AST', 'STL', 'BLK', 'TO', 'TO:DD', '2PA', '3PA', 'FTA'] as const) } };
        } else if (r < 0.42 && oppOnCourt.length > 0) {
            action = {
                type: 'ADD_FOUL_WITH_FREE_THROWS',
                payload: {
                    teamId,
                    playerId: player.id,
                    foulType: pick(['P', 'T', 'U'] as const),
                    shotSituation: pick(['none', '2P', '3P'] as const),
                    shotMade: rand() < 0.4,
                    // 本数と結果の件数は必ず一致させる。FoulInputFlow は
                    // new Array(count).fill(null) を全部埋めさせてから渡すので、
                    // 食い違った組み合わせは UI からは生成されない
                    ...(() => {
                        const n = Math.floor(rand() * 4);
                        return {
                            freeThrows: n,
                            freeThrowResults: Array.from({ length: n }, () => (rand() < 0.5 ? 'made' : 'missed') as 'made' | 'missed'),
                        };
                    })(),
                    shooterTeamId: oppId,
                    shooterPlayerId: pick(oppOnCourt).id,
                },
            };
        } else if (r < 0.46 && oppOnCourt.length > 0) {
            // 交代要員のテクニカル（選手行にT・コーチ行にB／チームファウルには入らない）
            const bench = team.players.filter(p => !p.isOnCourt);
            if (bench.length > 0) {
                action = {
                    type: 'ADD_FOUL_WITH_FREE_THROWS',
                    payload: {
                        teamId, playerId: pick(bench).id, foulType: 'T', shotSituation: 'none',
                        shotMade: false, freeThrows: 1,
                        freeThrowResults: [rand() < 0.5 ? 'made' : 'missed'],
                        shooterTeamId: oppId, shooterPlayerId: pick(oppOnCourt).id,
                        benchTechType: 'Sub',
                    },
                };
            }
        } else if (r < 0.50 && oppOnCourt.length > 0) {
            // コーチ・ベンチのファウル
            action = {
                type: 'ADD_FOUL_WITH_FREE_THROWS',
                payload: {
                    teamId, playerId: pick(['COACH', 'ACOACH', 'BENCH']), foulType: 'T',
                    shotSituation: 'none', shotMade: false, freeThrows: 1,
                    freeThrowResults: [rand() < 0.5 ? 'made' : 'missed'],
                    shooterTeamId: oppId, shooterPlayerId: pick(oppOnCourt).id,
                },
            };
        } else if (r < 0.58 && g.scoreHistory.length > 0) {
            action = { type: 'REMOVE_SCORE', payload: { entryId: pick(g.scoreHistory).id } };
        } else if (r < 0.63 && g.statHistory.length > 0) {
            action = { type: 'REMOVE_STAT', payload: { entryId: pick(g.statHistory).id } };
        } else if (r < 0.70 && g.foulHistory.length > 0) {
            action = { type: 'REMOVE_FOUL', payload: { entryId: pick(g.foulHistory).id } };
        } else if (r < 0.75 && g.scoreHistory.length > 0) {
            const e = pick(g.scoreHistory);
            action = { type: 'EDIT_SCORE', payload: { entryId: e.id, newPlayerId: pick(g[e.teamId as 'teamA' | 'teamB'].players).id, newScoreType: pick(['2P', '3P', 'FT'] as const) } };
        } else if (r < 0.79 && g.statHistory.length > 0) {
            const e = pick(g.statHistory);
            action = { type: 'EDIT_STAT', payload: { entryId: e.id, newPlayerId: pick(g[e.teamId as 'teamA' | 'teamB'].players).id, newStatType: pick(['OREB', 'AST', 'TO', '2PA', 'FTA'] as const) } };
        } else if (r < 0.83) {
            const movable = g.foulHistory.filter(f => !f.isCoachOrBench && f.playerId);
            if (movable.length > 0) {
                const e = pick(movable);
                action = { type: 'EDIT_FOUL', payload: { entryId: e.id, newPlayerId: pick(g[e.teamId as 'teamA' | 'teamB'].players).id } };
            }
        } else if (r < 0.86 && g.scoreHistory.length > 0) {
            action = { type: 'TOGGLE_OWN_GOAL', payload: { entryId: pick(g.scoreHistory).id } };
        } else if (r < 0.90 && g.scoreHistory.length > 0) {
            const e = pick(g.scoreHistory);
            if (!e.isOwnGoal) {
                action = { type: 'CONVERT_SCORE_TO_MISS', payload: { entryId: e.id, newMissType: e.scoreType === 'FT' ? 'FTA' : e.scoreType === '3P' ? '3PA' : '2PA' } };
            }
        } else if (r < 0.93) {
            const misses = g.statHistory.filter(s => ['2PA', '3PA', 'FTA'].includes(s.statType) && s.playerId !== 'unknown');
            if (misses.length > 0) {
                const e = pick(misses);
                action = { type: 'CONVERT_MISS_TO_SCORE', payload: { entryId: e.id, newScoreType: e.statType === 'FTA' ? 'FT' : e.statType === '3PA' ? '3P' : '2P', newPlayerId: e.playerId } };
            }
        } else if (r < 0.955) {
            // 保留アクションを作って、あとから解決する
            const pending = createPendingAction(
                pick(['SCORE', 'STAT', 'FOUL'] as const),
                pick(['2P', 'OREB', 'P']),
                teamId, g.currentQuarter, [], [],
            );
            action = { type: 'ADD_PENDING_ACTION', payload: pending };
        } else if (r < 0.975 && g.pendingActions.length > 0) {
            const pa = pick(g.pendingActions);
            action = rand() < 0.3 && pa.actionType === 'STAT'
                ? { type: 'RESOLVE_PENDING_ACTION_UNKNOWN', payload: { pendingActionId: pa.id } }
                : { type: 'RESOLVE_PENDING_ACTION', payload: { pendingActionId: pa.id, playerId: pick(g[pa.teamId].players).id } };
        } else if (r < 0.99) {
            const bench = team.players.filter(p => !p.isOnCourt);
            if (bench.length > 0) {
                action = { type: 'SUBSTITUTE_PLAYER', payload: { teamId, playerInId: pick(bench).id, playerOutId: player.id } };
            }
        } else {
            action = { type: 'END_QUARTER' };
        }

        if (!action) continue;

        // 実際のタップ間隔を模す。reducer は FT に now+1..now+3 の未来時刻を振るため、
        // 1ms未満で連続実行すると並びが人為的に壊れる
        clock += 200 + Math.floor(rand() * 3000);
        vi.setSystemTime(clock);

        g = gameReducer(g, action);
        // 終了・クォーター終了はすぐ次の期へ進めて記録を続ける
        if (g.phase === 'quarterEnd') g = { ...g, phase: 'playing' };
        if (g.phase === 'finished') g = { ...g, phase: 'playing', currentQuarter: 1 };
        trace.push(action.type);

        const violation = findViolation(g);
        if (violation) {
            return `seed=${seed} 手数${i} (${action.type}): ${violation}\n直近: ${trace.slice(-10).join(' -> ')}`;
        }
    }
    return null;
}

afterEach(() => vi.useRealTimers());

describe('gameReducer: 疑似試合の不変条件', () => {
    it('得点・ファウル・保留・訂正を混ぜても整合が保たれる', () => {
        vi.useFakeTimers();
        const failures: string[] = [];
        for (let seed = 1; seed <= 20; seed++) {
            const v = runGame(seed, 800);
            if (v) failures.push(v);
        }
        if (failures.length > 0) {
            // 失敗したシードと直近の操作列を出す（seed固定なので再現できる）
            console.log(failures.slice(0, 3).join('\n---\n'));
        }
        expect(failures).toEqual([]);
    });
});
