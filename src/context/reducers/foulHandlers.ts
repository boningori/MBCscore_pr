import type {
    Game,
    GameAction,
    FoulEntry,
    FoulType,
    FoulRecord,
    FreeThrowResult,
    ShotSituation,
    CoachFoulTarget,
    ScoreEntry,
} from '../../types/game';

export function handleAddFoul(state: Game, payload: GameAction['payload']): Game {
    const { teamId, playerId, foulType } = payload as {
        teamId: string;
        playerId: string | null;
        foulType: FoulType;
    };

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

export function handleAddFoulWithFreeThrows(state: Game, payload: GameAction['payload']): Game {
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
    } = payload as {
        teamId: string;
        playerId: string | null;
        foulType: FoulType;
        shotSituation: ShotSituation;
        shotMade?: boolean;
        freeThrows: number;
        freeThrowResults: FreeThrowResult[];
        shooterTeamId: string;
        shooterPlayerId: string;
        benchTechType?: 'HC' | 'AC' | 'Sub' | 'Bench';
    };

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

export function handleRemoveFoul(state: Game, payload: GameAction['payload']): Game {
    const { entryId } = payload as { entryId: string };
    const entry = state.foulHistory.find(f => f.id === entryId);
    if (!entry) return state;

    // FT成功数を計算（FT関連のデータがある場合）
    const ftMade = entry.freeThrowResults?.filter(r => r === 'made').length || 0;
    const ftAttempts = entry.freeThrows || 0;

    // ファウルをしたチームを更新
    const updateFoulingTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;

        // コーチ・ベンチファウルの削除
        if (entry.isCoachOrBench) {
            // coachFoulTargetに基づいて正しい配列から削除
            if (entry.coachFoulTarget === 'COACH') {
                const idx = team.coachFouls.findIndex(f => f === entry.foulType);
                if (idx !== -1) {
                    const newFouls = [...team.coachFouls];
                    newFouls.splice(idx, 1);
                    return { ...team, coachFouls: newFouls };
                }
            } else if (entry.coachFoulTarget === 'ACOACH') {
                const idx = team.assistantCoachFouls.findIndex(f => f === entry.foulType);
                if (idx !== -1) {
                    const newFouls = [...team.assistantCoachFouls];
                    newFouls.splice(idx, 1);
                    return { ...team, assistantCoachFouls: newFouls };
                }
            } else {
                // BENCH または 古いデータ（coachFoulTargetがない場合）
                const idx = team.benchFouls.findIndex(f => f === entry.foulType);
                if (idx !== -1) {
                    const newFouls = [...team.benchFouls];
                    newFouls.splice(idx, 1);
                    return { ...team, benchFouls: newFouls };
                }
                // 古いデータの場合はcoachFoulsからも試す
                const oldIdx = team.coachFouls.findIndex(f => f === entry.foulType);
                if (oldIdx !== -1) {
                    const newFouls = [...team.coachFouls];
                    newFouls.splice(oldIdx, 1);
                    return { ...team, coachFouls: newFouls };
                }
            }
            return team;
        }

        // 通常のプレイヤーファウルの削除
        // チームファウルも減算
        const newTeamFouls = [...team.teamFouls];
        if (newTeamFouls[entry.quarter - 1] > 0) {
            newTeamFouls[entry.quarter - 1]--;
        }

        return {
            ...team,
            teamFouls: newTeamFouls,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                // FoulRecord または FoulType の両方に対応
                const foulIndex = p.fouls.findIndex(f => {
                    if (typeof f === 'string') {
                        return f === entry.foulType;
                    }
                    return f.type === entry.foulType;
                });
                if (foulIndex !== -1) {
                    const fouls = [...p.fouls];
                    fouls.splice(foulIndex, 1);
                    return { ...p, fouls };
                }
                return p;
            })
        };
    };

    // シューターのスタッツを戻す
    const updateShooterTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget || ftAttempts === 0 || !entry.shooterPlayerId) return team;

        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.shooterPlayerId) return p;
                const stats = { ...p.stats };
                stats.freeThrowAttempt -= ftAttempts;
                stats.freeThrowMade -= ftMade;
                stats.points -= ftMade;
                return { ...p, stats };
            })
        };
    };

    // チーム更新（ファウル側）
    let newTeamA = updateFoulingTeam(state.teamA, entry.teamId === 'teamA');
    let newTeamB = updateFoulingTeam(state.teamB, entry.teamId === 'teamB');

    // チーム更新（シューター側）
    if (entry.shooterTeamId) {
        newTeamA = updateShooterTeam(newTeamA, entry.shooterTeamId === 'teamA');
        newTeamB = updateShooterTeam(newTeamB, entry.shooterTeamId === 'teamB');
    }

    // FT関連のスコア履歴を削除（同じタイムスタンプ付近のFTエントリを削除）
    let newScoreHistory = state.scoreHistory;
    if (ftMade > 0 && entry.shooterPlayerId) {
        // このファウルに関連するFTスコアを削除
        // タイムスタンプが近く、同じプレイヤーのFTエントリを削除
        const foulTimestamp = entry.timestamp;
        let removedCount = 0;
        newScoreHistory = state.scoreHistory.filter(s => {
            if (
                s.scoreType === 'FT' &&
                s.playerId === entry.shooterPlayerId &&
                s.teamId === entry.shooterTeamId &&
                Math.abs(s.timestamp - foulTimestamp) < 1000 && // 1秒以内
                removedCount < ftMade
            ) {
                removedCount++;
                return false;
            }
            return true;
        });
    }

    return {
        ...state,
        teamA: newTeamA,
        teamB: newTeamB,
        scoreHistory: newScoreHistory,
        foulHistory: state.foulHistory.filter(f => f.id !== entryId),
    };
}
