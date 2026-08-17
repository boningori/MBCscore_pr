import type {
    Game,
    PayloadOf,
    FoulEntry,
    FoulType,
    FoulRecord,
    CoachFoulTarget,
    ScoreEntry,
} from '../../types/game';
import { recalculateRunningScores } from './shared';

export function handleAddFoul(state: Game, payload: PayloadOf<'ADD_FOUL'>): Game {
    const { teamId, playerId, foulType } = payload;

    const isCoachOrBench = playerId === 'COACH' || playerId === 'ACOACH' || playerId === 'BENCH' || !playerId;
    const coachFoulTarget: CoachFoulTarget = playerId === 'COACH' ? 'COACH'
        : playerId === 'ACOACH' ? 'ACOACH'
            : playerId === 'BENCH' ? 'BENCH'
                : null;
    const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);

    const updateTeamFoul = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;

        // コーチファウル
        if (playerId === 'COACH') {
            return {
                ...team,
                coachFouls: [...team.coachFouls, foulType],
            };
        }

        // A.コーチファウル
        if (playerId === 'ACOACH') {
            return {
                ...team,
                assistantCoachFouls: [...team.assistantCoachFouls, foulType],
            };
        }

        // ベンチファウル
        if (playerId === 'BENCH') {
            return {
                ...team,
                benchFouls: [...team.benchFouls, foulType],
            };
        }

        // ベンチテクニカル等（playerId が null）もベンチファウルに
        if (!playerId) {
            return {
                ...team,
                benchFouls: [...team.benchFouls, foulType],
            };
        }

        // 通常のプレイヤーファウルのみチームファウルを加算
        const newTeamFouls = [...team.teamFouls];
        newTeamFouls[state.currentQuarter - 1]++;

        return {
            ...team,
            teamFouls: newTeamFouls,
            players: team.players.map(p => {
                if (p.id !== playerId) return p;
                return { ...p, fouls: [...p.fouls, foulType] };
            })
        };
    };

    // ファウル履歴エントリを作成
    const foulEntry: FoulEntry = {
        id: crypto.randomUUID(),
        teamId,
        playerId: isCoachOrBench ? null : playerId,
        playerNumber: isCoachOrBench ? -1 : (player?.number || 0),
        foulType,
        quarter: state.currentQuarter,
        timestamp: Date.now(),
        isCoachOrBench,
        coachFoulTarget,
    };

    return {
        ...state,
        teamA: updateTeamFoul(state.teamA, teamId === 'teamA'),
        teamB: updateTeamFoul(state.teamB, teamId === 'teamB'),
        foulHistory: [...state.foulHistory, foulEntry],
        selectedPlayerId: null,
        selectedTeamId: null,
    };
}

export function handleAddFoulWithFreeThrows(state: Game, payload: PayloadOf<'ADD_FOUL_WITH_FREE_THROWS'>): Game {
    const {
        teamId,
        playerId,
        foulType,
        shotSituation,
        freeThrows,
        freeThrowResults,
        shooterTeamId,
        shooterPlayerId,
        shotMade,
        benchTechType,  // ベンチテクニカルの種類（HC/AC/Sub/Bench）
    } = payload;

    // ベンチテクニカル関連の判定
    const isCoachOrBench = playerId === 'COACH' || playerId === 'ACOACH' || playerId === 'BENCH' || !playerId;
    const coachFoulTargetFT: CoachFoulTarget = playerId === 'COACH' ? 'COACH'
        : playerId === 'ACOACH' ? 'ACOACH'
            : playerId === 'BENCH' ? 'BENCH'
                : benchTechType === 'Sub' ? 'BENCH'  // 交代要員のテクニカルはコーチ行へのBとして扱う
                    : null;
    const foulingPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
    const shooterPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === shooterPlayerId);

    // FT成功数を計算
    const ftMade = freeThrowResults.filter(r => r === 'made').length;

    // ファウル記録（FoulRecord形式）
    const foulRecord: FoulRecord = {
        type: foulType,
        freeThrows,
        freeThrowResults: freeThrowResults.length > 0 ? freeThrowResults : undefined,
    };

    // ファウルをしたチームを更新
    const updateFoulingTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;

        // コーチファウル（監督本人）: コーチ行に「C」(T)
        if (playerId === 'COACH') {
            return {
                ...team,
                coachFouls: [...team.coachFouls, foulType],  // 'T' → 表示は「C」
            };
        }

        // A.コーチファウル: A.コーチ行に「C」(T)、コーチ行に「B」(BT)
        if (playerId === 'ACOACH') {
            return {
                ...team,
                assistantCoachFouls: [...team.assistantCoachFouls, foulType],  // 'T' → 表示は「C」
                coachFouls: [...team.coachFouls, 'BT' as FoulType],  // ダブルカウント: コーチ行に「B」
            };
        }

        // ベンチ関係者ファウル: コーチ行に「B」(BT)のみ
        if (playerId === 'BENCH' || (!playerId && !benchTechType)) {
            return {
                ...team,
                coachFouls: [...team.coachFouls, 'BT' as FoulType],  // コーチ行に「B」
            };
        }

        // 交代要員のテクニカル: 選手行に「T」、コーチ行に「B」(BT)
        // チームファウルには加算しない
        if (benchTechType === 'Sub' && foulingPlayer) {
            return {
                ...team,
                coachFouls: [...team.coachFouls, 'BT' as FoulType],  // ダブルカウント: コーチ行に「B」
                players: team.players.map(p => {
                    if (p.id !== playerId) return p;
                    return { ...p, fouls: [...p.fouls, foulRecord] };  // 選手行に「T」
                })
            };
        }

        // 通常のプレイヤーファウル（コート上の選手）はチームファウルを加算
        const newTeamFouls = [...team.teamFouls];
        newTeamFouls[state.currentQuarter - 1]++;

        return {
            ...team,
            teamFouls: newTeamFouls,
            players: team.players.map(p => {
                if (p.id !== playerId) return p;
                return { ...p, fouls: [...p.fouls, foulRecord] };
            })
        };
    };

    // バスケットカウント（シュート成功）の得点
    const basketPoints = shotMade && shotSituation !== 'none' ? (shotSituation === '3P' ? 3 : 2) : 0;

    // シューターチームを更新（バスケット得点 + FT得点とスタッツ）
    const updateShooterTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget || !shooterPlayerId) return team;
        if (freeThrows === 0 && !shotMade) return team;

        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== shooterPlayerId) return p;
                const stats = { ...p.stats };
                // バスケットカウント：シュート成功分のスタッツ
                if (shotMade && shotSituation !== 'none') {
                    if (shotSituation === '2P') {
                        stats.twoPointAttempt += 1;
                        stats.twoPointMade += 1;
                    } else {
                        stats.threePointAttempt += 1;
                        stats.threePointMade += 1;
                    }
                    stats.points += basketPoints;
                }
                // FTスタッツ
                if (freeThrows > 0) {
                    stats.freeThrowAttempt += freeThrows;
                    stats.freeThrowMade += ftMade;
                    stats.points += ftMade;
                }
                return { ...p, stats };
            })
        };
    };

    // ファウル履歴エントリを作成
    // 交代要員の場合はplayerIdとplayerNumberを記録（選手行にTが記録されるため）
    const isSubstitute = benchTechType === 'Sub';
    const foulEntry: FoulEntry = {
        id: crypto.randomUUID(),
        teamId,
        playerId: isSubstitute ? playerId : (isCoachOrBench ? null : playerId),
        playerNumber: isSubstitute ? (foulingPlayer?.number || 0) : (isCoachOrBench ? -1 : (foulingPlayer?.number || 0)),
        foulType,
        quarter: state.currentQuarter,
        timestamp: Date.now(),
        isCoachOrBench: isCoachOrBench && !isSubstitute,  // 交代要員は選手扱い
        coachFoulTarget: coachFoulTargetFT,
        freeThrows,
        freeThrowResults,
        shotSituation,
        shotMade: shotMade || undefined,
        shooterTeamId: (freeThrows > 0 || shotMade) ? shooterTeamId : undefined,
        shooterPlayerId: (freeThrows > 0 || shotMade) ? shooterPlayerId : undefined,
        shooterPlayerNumber: (freeThrows > 0 || shotMade) ? (shooterPlayer?.number || 0) : undefined,
    };

    // チーム更新（ファウル側）
    let newTeamA = updateFoulingTeam(state.teamA, teamId === 'teamA');
    let newTeamB = updateFoulingTeam(state.teamB, teamId === 'teamB');

    // チーム更新（シューター側）
    newTeamA = updateShooterTeam(newTeamA, shooterTeamId === 'teamA');
    newTeamB = updateShooterTeam(newTeamB, shooterTeamId === 'teamB');

    // スコア履歴を追加（バスケット + FT）
    const newScoreHistory = [...state.scoreHistory];
    const now = Date.now();

    // バスケットカウント（シュート成功）のスコア履歴
    if (shotMade && basketPoints > 0 && shooterPlayerId) {
        const finalScoreA = newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0);
        const finalScoreB = newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0);
        const basketScoreA = shooterTeamId === 'teamA' ? finalScoreA - ftMade : finalScoreA;
        const basketScoreB = shooterTeamId === 'teamB' ? finalScoreB - ftMade : finalScoreB;

        const basketEntry: ScoreEntry = {
            id: crypto.randomUUID(),
            teamId: shooterTeamId,
            playerId: shooterPlayerId,
            playerNumber: shooterPlayer?.number || 0,
            scoreType: shotSituation === '3P' ? '3P' : '2P',
            points: basketPoints,
            quarter: state.currentQuarter,
            timestamp: now,
            runningScoreA: basketScoreA,
            runningScoreB: basketScoreB,
            sourceFoulId: foulEntry.id,
        };
        newScoreHistory.push(basketEntry);
    }

    // FT成功分のスコア履歴
    if (ftMade > 0 && shooterPlayerId) {
        const finalScoreA = newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0);
        const finalScoreB = newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0);

        const baseScoreA = shooterTeamId === 'teamA' ? finalScoreA - ftMade : finalScoreA;
        const baseScoreB = shooterTeamId === 'teamB' ? finalScoreB - ftMade : finalScoreB;

        for (let i = 0; i < ftMade; i++) {
            const scoreEntry: ScoreEntry = {
                id: crypto.randomUUID(),
                teamId: shooterTeamId,
                playerId: shooterPlayerId,
                playerNumber: shooterPlayer?.number || 0,
                scoreType: 'FT',
                points: 1,
                quarter: state.currentQuarter,
                timestamp: now + 1 + i,
                runningScoreA: shooterTeamId === 'teamA' ? baseScoreA + (i + 1) : baseScoreA,
                runningScoreB: shooterTeamId === 'teamB' ? baseScoreB + (i + 1) : baseScoreB,
                sourceFoulId: foulEntry.id,
            };
            newScoreHistory.push(scoreEntry);
        }
    }

    return {
        ...state,
        teamA: newTeamA,
        teamB: newTeamB,
        scoreHistory: newScoreHistory,
        foulHistory: [...state.foulHistory, foulEntry],
        selectedPlayerId: null,
        selectedTeamId: null,
    };
}

/**
 * 交代要員のテクニカルか。
 *
 * このファウルだけは「選手行にT・コーチ行にB」で、チームファウルには入らない
 * （handleAddFoulWithFreeThrows の benchTechType === 'Sub' 分岐）。
 * 記録側では isCoachOrBench を false にして選手扱いしているため、
 * 取り消し側は playerId と coachFoulTarget の組み合わせで見分ける。
 */
function isSubstituteTech(entry: FoulEntry): boolean {
    return entry.playerId !== null && entry.coachFoulTarget === 'BENCH';
}

/**
 * 指定ピリオドのチームファウルを1つ減らした配列を返す。
 *
 * OTの枠は直前ピリオドの数を種にして積み上がる（gameFlowHandlers の
 * extendForOT）。つまりOT欄には第4Qで犯したファウルが含まれている。
 * 第4Q以降のファウルを取り消すときは、それを含んでいる後続のOT欄も
 * まとめて減らさないと通算が水増しのまま残り、ペナルティ判定
 * （OT欄を見ている）が本来より早くFTに入る。
 *
 * Q1〜Q3は互いに独立なので、その枠だけを減らす。
 */
function decrementTeamFoul(teamFouls: number[], quarter: number): number[] {
    const next = [...teamFouls];
    const decrement = (index: number) => {
        if (next[index] > 0) next[index]--;
    };

    decrement(quarter - 1);
    if (quarter >= 4) {
        for (let i = quarter; i < next.length; i++) decrement(i);
    }
    return next;
}

/** 配列から最初の該当を1つだけ取り除く。無ければ元の配列をそのまま返す */
function removeOneFoul(list: FoulType[], target: FoulType): FoulType[] {
    const index = list.findIndex(f => f === target);
    if (index === -1) return list;
    const next = [...list];
    next.splice(index, 1);
    return next;
}

/**
 * 取り消すファウルに対応する記録の位置を返す（見つからなければ -1）。
 *
 * 同じ選手が同種のファウルを複数持つのは普通にある（P と P2 など）。
 * 種類だけで探すと先頭が消えてスコアシートの表記が入れ替わるため、
 * FT本数まで一致するものを優先する。一致が無いときだけ種類で妥協する
 * （レガシーの FoulType[] 形式や、記録内容が食い違う古いデータ向け）。
 */
function findFoulIndex(fouls: (FoulType | FoulRecord)[], entry: FoulEntry): number {
    if (entry.freeThrows === undefined) {
        // ADD_FOUL 由来はFoulType文字列で入っている
        const legacy = fouls.findIndex(f => typeof f === 'string' && f === entry.foulType);
        if (legacy !== -1) return legacy;
    } else {
        const exact = fouls.findIndex(f =>
            typeof f !== 'string' && f.type === entry.foulType && (f.freeThrows ?? 0) === entry.freeThrows);
        if (exact !== -1) return exact;
    }
    return fouls.findIndex(f => (typeof f === 'string' ? f : f.type) === entry.foulType);
}

export function handleRemoveFoul(state: Game, payload: PayloadOf<'REMOVE_FOUL'>): Game {
    const { entryId } = payload;
    const entry = state.foulHistory.find(f => f.id === entryId);
    if (!entry) return state;

    // FT成功数を計算（FT関連のデータがある場合）
    const ftMade = entry.freeThrowResults?.filter(r => r === 'made').length || 0;
    const ftAttempts = entry.freeThrows || 0;

    // ファウルをしたチームを更新。
    // 記録側が複数の行へ書いたものは、ここで対にして消す。片方だけ消すと
    // 公式様式に取り消せないファウルが残る（A.コーチ・交代要員のBが実際にそうだった）。
    const updateFoulingTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;

        // コーチ・A.コーチ・ベンチ関係者のファウル
        if (entry.isCoachOrBench) {
            if (entry.coachFoulTarget === 'COACH') {
                return { ...team, coachFouls: removeOneFoul(team.coachFouls, entry.foulType) };
            }
            if (entry.coachFoulTarget === 'ACOACH') {
                // 記録時にコーチ行へBを二重計上しているので対で消す
                return {
                    ...team,
                    assistantCoachFouls: removeOneFoul(team.assistantCoachFouls, entry.foulType),
                    coachFouls: removeOneFoul(team.coachFouls, 'BT'),
                };
            }
            // BENCH、または coachFoulTarget を持たない古いデータ。
            // ADD_FOUL 経由は benchFouls、FT付きフロー経由はコーチ行のB、と
            // 記録先が分かれているため、実際に入っている方から消す
            const benchRemoved = removeOneFoul(team.benchFouls, entry.foulType);
            if (benchRemoved !== team.benchFouls) {
                return { ...team, benchFouls: benchRemoved };
            }
            const coachRemoved = removeOneFoul(team.coachFouls, entry.foulType);
            if (coachRemoved !== team.coachFouls) {
                return { ...team, coachFouls: coachRemoved };
            }
            return { ...team, coachFouls: removeOneFoul(team.coachFouls, 'BT') };
        }

        const players = team.players.map(p => {
            if (p.id !== entry.playerId) return p;
            const foulIndex = findFoulIndex(p.fouls, entry);
            if (foulIndex === -1) return p;
            const fouls = [...p.fouls];
            fouls.splice(foulIndex, 1);
            return { ...p, fouls };
        });

        // 交代要員のテクニカルは記録時にチームファウルへ加算していない。
        // 代わりにコーチ行へBを二重計上しているので、そちらを対で消す
        if (isSubstituteTech(entry)) {
            return { ...team, players, coachFouls: removeOneFoul(team.coachFouls, 'BT') };
        }

        // 通常のプレイヤーファウルはチームファウルも減算。
        // OT欄は第4Qからの通算なので、後続の枠にも伝える（decrementTeamFoul）
        return { ...team, teamFouls: decrementTeamFoul(team.teamFouls, entry.quarter), players };
    };

    // バスケットカウント(and-1)の得点（削除時に戻すため）
    const basketPoints = entry.shotMade && entry.shotSituation && entry.shotSituation !== 'none'
        ? (entry.shotSituation === '3P' ? 3 : 2)
        : 0;

    // このファウルが生成した得点エントリ（FT成功分＋バスケットカウント）を特定する。
    // sourceFoulId を持つ新しいデータは確実に引ける。持たない旧データだけ、
    // 従来の「同じシューター・1秒以内」の推測にフォールバックする
    const removedScoreEntries: ScoreEntry[] = [];
    if (entry.shooterPlayerId && (ftMade > 0 || basketPoints > 0)) {
        const linked = state.scoreHistory.filter(s => s.sourceFoulId === entry.id);
        if (linked.length > 0) {
            removedScoreEntries.push(...linked);
        } else {
            const basketType = entry.shotSituation === '3P' ? '3P' : '2P';
            let removedFt = 0;
            let basketRemoved = basketPoints === 0; // バスケットが無ければ対象なし
            for (const s of state.scoreHistory) {
                if (s.sourceFoulId) continue; // 別のファウルに紐づく分は触らない
                const sameShooter =
                    s.playerId === entry.shooterPlayerId &&
                    s.teamId === entry.shooterTeamId &&
                    Math.abs(s.timestamp - entry.timestamp) < 1000; // 1秒以内
                if (!sameShooter) continue;
                if (s.scoreType === 'FT' && removedFt < ftMade) {
                    removedFt++;
                    removedScoreEntries.push(s);
                } else if (!basketRemoved && s.scoreType === basketType && s.points === basketPoints) {
                    basketRemoved = true;
                    removedScoreEntries.push(s);
                }
            }
        }
    }
    const removedScoreIds = new Set(removedScoreEntries.map(s => s.id));
    const newScoreHistory = removedScoreIds.size > 0
        ? state.scoreHistory.filter(s => !removedScoreIds.has(s.id))
        : state.scoreHistory;

    // 取り消した得点は、いま記録されている選手から戻す。
    // ファウルに控えたシューターを見て戻すと、履歴編集で得点を別の選手へ
    // 付け替えたあとに帳尻が合わなくなる（得点だけ残ってスタッツが減る）
    const reverseRemovedScores = (team: typeof state.teamA, teamId: 'teamA' | 'teamB') => {
        const targets = removedScoreEntries.filter(s => s.teamId === teamId);
        if (targets.length === 0) return team;
        return {
            ...team,
            players: team.players.map(p => {
                const mine = targets.filter(s => s.playerId === p.id);
                if (mine.length === 0) return p;
                const stats = { ...p.stats };
                for (const s of mine) {
                    stats.points -= s.points;
                    if (s.scoreType === '2P') { stats.twoPointMade--; stats.twoPointAttempt--; }
                    else if (s.scoreType === '3P') { stats.threePointMade--; stats.threePointAttempt--; }
                    else { stats.freeThrowMade--; stats.freeThrowAttempt--; }
                }
                return { ...p, stats };
            })
        };
    };

    // 外したFTは得点エントリを持たないため、本数だけシューターから戻す
    const missedFreeThrows = ftAttempts - ftMade;
    const reverseMissedFreeThrows = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget || !entry.shooterPlayerId || missedFreeThrows <= 0) return team;
        return {
            ...team,
            players: team.players.map(p => p.id === entry.shooterPlayerId
                ? { ...p, stats: { ...p.stats, freeThrowAttempt: p.stats.freeThrowAttempt - missedFreeThrows } }
                : p),
        };
    };

    // チーム更新（ファウル側）
    let newTeamA = updateFoulingTeam(state.teamA, entry.teamId === 'teamA');
    let newTeamB = updateFoulingTeam(state.teamB, entry.teamId === 'teamB');

    // チーム更新（得点側）
    newTeamA = reverseRemovedScores(newTeamA, 'teamA');
    newTeamB = reverseRemovedScores(newTeamB, 'teamB');
    newTeamA = reverseMissedFreeThrows(newTeamA, entry.shooterTeamId === 'teamA');
    newTeamB = reverseMissedFreeThrows(newTeamB, entry.shooterTeamId === 'teamB');

    return {
        ...state,
        teamA: newTeamA,
        teamB: newTeamB,
        // 得点エントリを削除すると後続の累計がずれるため再計算（公式スコアシートの整合性維持）
        scoreHistory: recalculateRunningScores(newScoreHistory),
        foulHistory: state.foulHistory.filter(f => f.id !== entryId),
    };
}
