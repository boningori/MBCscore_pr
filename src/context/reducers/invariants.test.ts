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

        const periodCount = g[t].teamFouls.length;
        const countsTowardTeamFoul = (quarterFrom: number, quarterTo: number) =>
            g.foulHistory.filter(f =>
                f.teamId === t && f.quarter >= quarterFrom && f.quarter <= quarterTo
                && !f.isCoachOrBench && f.coachFoulTarget !== 'BENCH').length;

        // Q1〜Q3のチームファウルは、その期の通常ファウル数と一致する
        for (const q of [1, 2, 3]) {
            const stored = g[t].teamFouls[q - 1] ?? 0;
            const counted = countsTowardTeamFoul(q, q);
            if (stored !== counted) return `${t} Q${q}: teamFouls=${stored} 履歴=${counted}`;
        }

        // Q4以降のOT欄は「第4Qからの通算」（gameFlowHandlers の extendForOT）。
        // 4Q欄も含め、第4Q以降そのピリオドまでの累計と一致する
        for (let q = 4; q <= periodCount; q++) {
            const stored = g[t].teamFouls[q - 1] ?? 0;
            const counted = countsTowardTeamFoul(4, q);
            if (stored !== counted) return `${t} 第${q}期: teamFouls=${stored} 履歴の通算=${counted}`;
        }

        // 公式様式のコーチ行・A.コーチ行の枚数が履歴と一致する。
        //
        // コーチ行には監督本人のT（表示「C」）に加えて、A.コーチ・ベンチ関係者・
        // 交代要員のテクニカルが「B」として二重計上される（foulHandlers）。
        // 選手行とチームファウルしか見ていなかったため、取り消しがコーチ行の
        // 別のマークを食う不具合を素通りしていた（実測: 監督のCとベンチのBが
        // 並んだ状態でベンチを取り消すと、消えるのは監督のCのほうで、
        // 残ったBはその後どの履歴を消しても当たらない）。
        const coachOwn = g.foulHistory.filter(f => f.teamId === t && f.coachFoulTarget === 'COACH').length;
        const acoach = g.foulHistory.filter(f => f.teamId === t && f.coachFoulTarget === 'ACOACH').length;
        // ベンチ関係者と交代要員は、どちらも coachFoulTarget === 'BENCH' でコーチ行へB
        const benchRow = g.foulHistory.filter(f => f.teamId === t && f.coachFoulTarget === 'BENCH').length;
        const expectedCoachRow = coachOwn + acoach + benchRow;
        if (g[t].coachFouls.length !== expectedCoachRow) {
            return `${t}: coachFouls=${g[t].coachFouls.length} 期待=${expectedCoachRow}`;
        }
        if ((g[t].assistantCoachFouls?.length ?? 0) !== acoach) {
            return `${t}: assistantCoachFouls=${g[t].assistantCoachFouls?.length} 期待=${acoach}`;
        }

        for (const p of g[t].players) {
            // 出場欄はピリオド数ぶん用意されている（OT突入で両方が伸びる）
            if (p.quartersPlayed.length !== periodCount) {
                return `${p.id}: quartersPlayed=${p.quartersPlayed.length} ピリオド数=${periodCount}`;
            }

            const s = p.stats;
            for (const [k, v] of Object.entries(s)) {
                if ((v as number) < 0) return `${p.id}: ${k}が負(${v})`;
            }
            if (s.twoPointMade > s.twoPointAttempt) return `${p.id}: 2P成功>試投`;
            if (s.threePointMade > s.threePointAttempt) return `${p.id}: 3P成功>試投`;
            if (s.freeThrowMade > s.freeThrowAttempt) return `${p.id}: FT成功>試投`;

            // 選手のファウル欄と履歴が、件数だけでなく並びまで一致する。
            //
            // 様式は fouls[i] の表記と、時刻順 i 番目の履歴のピリオド（記入色）を
            // 対にして1マスを描く（RunningScoresheet.renderPlayerRow）。件数しか
            // 見ていなかったため、取り消し・付け替えで中身が入れ替わっても素通り
            // していた（実測: Q1のP・Q2のT1・Q3のP からQ3のPを取り消すと
            // 欄1が「T1」でQ1の赤になる）。
            const ordered = g.foulHistory
                .filter(f => f.playerId === p.id && !f.isCoachOrBench)
                .sort((x, y) => x.timestamp - y.timestamp);
            if (p.fouls.length !== ordered.length) {
                return `${p.id}: fouls=${p.fouls.length} 履歴=${ordered.length}`;
            }
            for (let i = 0; i < ordered.length; i++) {
                const cell = p.fouls[i];
                const cellType = typeof cell === 'string' ? cell : cell.type;
                if (cellType !== ordered[i].foulType) {
                    return `${p.id}: ファウル欄${i + 1}=${cellType} 履歴=${ordered[i].foulType}(Q${ordered[i].quarter})`;
                }
                const cellFt = typeof cell === 'string' ? undefined : cell.freeThrows;
                if (cellFt !== undefined && ordered[i].freeThrows !== undefined
                    && cellFt !== ordered[i].freeThrows) {
                    return `${p.id}: ファウル欄${i + 1}のFT=${cellFt} 履歴=${ordered[i].freeThrows}`;
                }
            }

            // 得点は個々のスタッツから導ける（オウンゴールはシュート成績に入らない）
            const og = g.scoreHistory
                .filter(e => e.playerId === p.id && e.isOwnGoal)
                .reduce((sum, e) => sum + e.points, 0);
            const derived = s.twoPointMade * 2 + s.threePointMade * 3 + s.freeThrowMade + og;
            if (s.points !== derived) return `${p.id}: points=${s.points} 導出=${derived}`;
        }

        // 記録のピリオドは、存在するピリオドの範囲に収まる
        for (const to of g[t].timeouts) {
            if (to.quarter < 1 || to.quarter > periodCount) {
                return `${t}: タイムアウトのピリオド=${to.quarter} ピリオド数=${periodCount}`;
            }
        }
    }

    const maxPeriod = Math.max(g.teamA.teamFouls.length, g.teamB.teamFouls.length);
    for (const e of g.scoreHistory) {
        if (e.quarter < 1 || e.quarter > maxPeriod) return `得点のピリオド=${e.quarter} ピリオド数=${maxPeriod}`;
    }
    for (const f of g.foulHistory) {
        if (f.quarter < 1 || f.quarter > maxPeriod) return `ファウルのピリオド=${f.quarter} ピリオド数=${maxPeriod}`;
    }
    return null;
}

/** 1試合のあいだに足す「遅れて来た選手」の上限 */
const MAX_LATE_ARRIVALS = 4;

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
    // 試合中に足した選手の数（上限は ADD_PLAYER_TO_TEAM の分岐のコメント）
    let lateArrivals = 0;

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

        if (r < 0.14) {
            action = { type: 'ADD_SCORE', payload: { teamId, playerId: player.id, scoreType: pick(['2P', '3P', 'FT'] as const) } };
        } else if (r < 0.24) {
            action = { type: 'ADD_STAT', payload: { teamId, playerId: player.id, statType: pick(['OREB', 'DREB', 'AST', 'STL', 'BLK', 'TO', 'TO:DD', '2PA', '3PA', 'FTA'] as const) } };
        } else if (r < 0.34 && oppOnCourt.length > 0) {
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
        } else if (r < 0.38 && oppOnCourt.length > 0) {
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
        } else if (r < 0.42 && oppOnCourt.length > 0) {
            // コーチ・ベンチのファウル。組み合わせは App.tsx の
            // handleCoachFoulTypeSelect と揃える —— playerId と foulType と
            // benchTechType は独立に選べる値ではない（ベンチ関係者だけ 'BT'）。
            // UIが作れない組み合わせを流すと、直すべきでない失敗を追うことになる。
            // 記録側の表記に取り消しが依存していないことは
            // gameReducer.foulRemoval.test.ts で別に固定している
            const kind = pick(['HC', 'AC', 'Bench'] as const);
            action = {
                type: 'ADD_FOUL_WITH_FREE_THROWS',
                payload: {
                    teamId,
                    playerId: kind === 'HC' ? 'COACH' : kind === 'AC' ? 'ACOACH' : 'BENCH',
                    foulType: kind === 'Bench' ? 'BT' : 'T',
                    shotSituation: 'none', shotMade: false, freeThrows: 1,
                    freeThrowResults: [rand() < 0.5 ? 'made' : 'missed'],
                    shooterTeamId: oppId, shooterPlayerId: pick(oppOnCourt).id,
                    benchTechType: kind,
                },
            };
        } else if (r < 0.50 && g.scoreHistory.length > 0) {
            action = { type: 'REMOVE_SCORE', payload: { entryId: pick(g.scoreHistory).id } };
        } else if (r < 0.54 && g.statHistory.length > 0) {
            action = { type: 'REMOVE_STAT', payload: { entryId: pick(g.statHistory).id } };
        } else if (r < 0.60 && g.foulHistory.length > 0) {
            action = { type: 'REMOVE_FOUL', payload: { entryId: pick(g.foulHistory).id } };
        } else if (r < 0.64 && g.scoreHistory.length > 0) {
            const e = pick(g.scoreHistory);
            action = { type: 'EDIT_SCORE', payload: { entryId: e.id, newPlayerId: pick(g[e.teamId as 'teamA' | 'teamB'].players).id, newScoreType: pick(['2P', '3P', 'FT'] as const) } };
        } else if (r < 0.67 && g.statHistory.length > 0) {
            const e = pick(g.statHistory);
            action = { type: 'EDIT_STAT', payload: { entryId: e.id, newPlayerId: pick(g[e.teamId as 'teamA' | 'teamB'].players).id, newStatType: pick(['OREB', 'AST', 'TO', '2PA', 'FTA'] as const) } };
        } else if (r < 0.70) {
            const movable = g.foulHistory.filter(f => !f.isCoachOrBench && f.playerId);
            if (movable.length > 0) {
                const e = pick(movable);
                action = { type: 'EDIT_FOUL', payload: { entryId: e.id, newPlayerId: pick(g[e.teamId as 'teamA' | 'teamB'].players).id } };
            }
        } else if (r < 0.715) {
            // FTの成否の訂正。得点エントリを足し引きするので、累計と
            // シューターの成績が崩れないかをここでも見る（handleEditFoulFreeThrows）
            const withFt = g.foulHistory.filter(f => (f.freeThrows ?? 0) > 0);
            if (withFt.length > 0) {
                const e = pick(withFt);
                action = {
                    type: 'EDIT_FOUL_FREE_THROWS',
                    payload: {
                        entryId: e.id,
                        freeThrowResults: Array.from(
                            { length: e.freeThrows ?? 0 },
                            () => (rand() < 0.5 ? 'made' : 'missed') as 'made' | 'missed',
                        ),
                    },
                };
            }
        } else if (r < 0.73 && g.scoreHistory.length > 0) {
            action = { type: 'TOGGLE_OWN_GOAL', payload: { entryId: pick(g.scoreHistory).id } };
        } else if (r < 0.77 && g.scoreHistory.length > 0) {
            // 成否の訂正は選手の付け替えを伴うことがある（EditActionModal）
            const e = pick(g.scoreHistory);
            if (!e.isOwnGoal) {
                action = {
                    type: 'CONVERT_SCORE_TO_MISS',
                    payload: {
                        entryId: e.id,
                        newMissType: e.scoreType === 'FT' ? 'FTA' : e.scoreType === '3P' ? '3PA' : '2PA',
                        newPlayerId: pick(g[e.teamId as 'teamA' | 'teamB'].players).id,
                    },
                };
            }
        } else if (r < 0.80) {
            const misses = g.statHistory.filter(s => ['2PA', '3PA', 'FTA'].includes(s.statType) && s.playerId !== 'unknown');
            if (misses.length > 0) {
                const e = pick(misses);
                action = {
                    type: 'CONVERT_MISS_TO_SCORE',
                    payload: {
                        entryId: e.id,
                        newScoreType: e.statType === 'FTA' ? 'FT' : e.statType === '3PA' ? '3P' : '2P',
                        newPlayerId: pick(g[e.teamId as 'teamA' | 'teamB'].players).id,
                    },
                };
            }
        } else if (r < 0.845) {
            // 保留アクションを作って、あとから解決する。
            // value は種別ごとに正しいものを渡す（UIもそうしている）
            const actionType = pick(['SCORE', 'STAT', 'FOUL'] as const);
            const value = actionType === 'SCORE' ? pick(['2P', '3P', 'FT'])
                : actionType === 'STAT' ? pick(['OREB', 'DREB', 'AST', 'TO'])
                    : pick(['P', 'T', 'U']);
            action = {
                type: 'ADD_PENDING_ACTION',
                payload: createPendingAction(actionType, value, teamId, g.currentQuarter, []),
            };
        } else if (r < 0.90 && g.pendingActions.length > 0) {
            const pa = pick(g.pendingActions);
            const who = pick(g[pa.teamId].players).id;
            const how = rand();
            if (pa.actionType === 'FOUL' && how < 0.4) {
                // FT付きで解決（記録当時のピリオドへ後から足す経路）
                const shooterTeam = pa.teamId === 'teamA' ? 'teamB' : 'teamA';
                const n = Math.floor(rand() * 3);
                action = {
                    type: 'RESOLVE_PENDING_ACTION_WITH_FREE_THROWS',
                    payload: {
                        pendingActionId: pa.id,
                        playerId: who,
                        foulType: pick(['P', 'T', 'U'] as const),
                        shotSituation: pick(['none', '2P'] as const),
                        shotMade: rand() < 0.3,
                        freeThrows: n,
                        freeThrowResults: Array.from({ length: n }, () => (rand() < 0.5 ? 'made' : 'missed') as 'made' | 'missed'),
                        shooterTeamId: shooterTeam,
                        shooterPlayerId: pick(g[shooterTeam].players).id,
                    },
                };
            } else if (pa.actionType === 'FOUL' && how < 0.7) {
                action = {
                    type: 'RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE',
                    payload: { pendingActionId: pa.id, playerId: who, foulType: pick(['P', 'T', 'U'] as const) },
                };
            } else if (pa.actionType === 'STAT' && how < 0.85) {
                action = { type: 'RESOLVE_PENDING_ACTION_UNKNOWN', payload: { pendingActionId: pa.id } };
            } else {
                action = { type: 'RESOLVE_PENDING_ACTION', payload: { pendingActionId: pa.id, playerId: who } };
            }
        } else if (r < 0.925) {
            const bench = team.players.filter(p => !p.isOnCourt);
            if (bench.length > 0) {
                action = { type: 'SUBSTITUTE_PLAYER', payload: { teamId, playerInId: pick(bench).id, playerOutId: player.id } };
            }
        } else if (r < 0.94 && lateArrivals < MAX_LATE_ARRIVALS) {
            // 遅れて来た選手を試合中に足す（交代モーダルの「選手を追加」）。
            //
            // この経路だけが quartersPlayed の枠数を別の出どころから決めている
            // —— Math.max(4, state.teamA.teamFouls.length) で、teamB へ足すときも
            // teamA を読む（handleAddPlayerToTeam）。いまは END_QUARTER が両チームを
            // 揃えて伸ばすので一致するが、その結合を保証しているものは無い。
            // ここを踏ませておけば、チームごとの
            // 「quartersPlayed.length === teamFouls.length」がその番人になる。
            // 延長に入ってから足す場合も同じ経路で検査される。
            //
            // 追加は上限を設ける。1000手のあいだ足し続けると名簿が実際の試合から
            // かけ離れ、公式様式の15人枠も超えてしまう（そこはこの検査の対象外）
            lateArrivals++;
            action = {
                type: 'ADD_PLAYER_TO_TEAM',
                payload: { teamId, number: 40 + lateArrivals, name: `遅刻${lateArrivals}` },
            };
        } else if (r < 0.95) {
            action = { type: 'ADD_TIMEOUT', payload: { teamId, elapsedMinutes: Math.floor(rand() * 6) } };
        } else if (r < 0.965) {
            action = { type: 'REMOVE_TIMEOUT', payload: { teamId, quarter: g.currentQuarter } };
        } else if (r < 0.985) {
            action = { type: 'END_QUARTER' };
        } else {
            // クォーター終了の取り消し（新Qに記録があれば reducer 側で no-op）
            action = { type: 'UNDO_QUARTER_END' };
        }

        if (!action) continue;

        // 実際のタップ間隔を模す。reducer は FT に now+1..now+3 の未来時刻を振るため、
        // 1ms未満で連続実行すると並びが人為的に壊れる
        clock += 200 + Math.floor(rand() * 3000);
        vi.setSystemTime(clock);

        g = gameReducer(g, action);
        // クォーター終了中も記録は続けられる（様式の注意書きどおり）。
        // 半分は quarterEnd のまま進めて、その経路も踏ませる
        if (g.phase === 'quarterEnd' && rand() < 0.5) g = { ...g, phase: 'playing' };
        if (g.phase === 'finished') g = { ...g, phase: 'playing' };
        trace.push(`${action.type}@Q${g.currentQuarter}`);

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
        for (let seed = 1; seed <= 40; seed++) {
            const v = runGame(seed, 1000);
            if (v) failures.push(v);
        }
        if (failures.length > 0) {
            // 失敗したシードと直近の操作列を出す（seed固定なので再現できる）
            console.log(failures.slice(0, 3).join('\n---\n'));
        }
        expect(failures).toEqual([]);
    });
});
