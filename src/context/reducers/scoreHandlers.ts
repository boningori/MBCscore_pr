import type { Game, PayloadOf, ScoreEntry, StatEntry } from '../../types/game';
import { recalculateRunningScores } from './shared';

export function handleAddScore(state: Game, payload: PayloadOf<'ADD_SCORE'>): Game {
    const { teamId, playerId, scoreType, entryId } = payload;
    const points = scoreType === '3P' ? 3 : scoreType === '2P' ? 2 : 1;

    const updateTeamScore = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== playerId) return p;
                const stats = { ...p.stats, points: p.stats.points + points };
                if (scoreType === '2P') {
                    stats.twoPointMade++;
                    stats.twoPointAttempt++;
                } else if (scoreType === '3P') {
                    stats.threePointMade++;
                    stats.threePointAttempt++;
                } else {
                    stats.freeThrowMade++;
                    stats.freeThrowAttempt++;
                }
                return { ...p, stats };
            })
        };
    };

    const newTeamA = updateTeamScore(state.teamA, teamId === 'teamA');
    const newTeamB = updateTeamScore(state.teamB, teamId === 'teamB');

    const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
    const scoreEntry: ScoreEntry = {
        id: entryId ?? crypto.randomUUID(),
        teamId,
        playerId,
        playerNumber: player?.number || 0,
        scoreType,
        points,
        quarter: state.currentQuarter,
        timestamp: Date.now(),
        runningScoreA: newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0),
        runningScoreB: newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0),
    };

    return {
        ...state,
        teamA: newTeamA,
        teamB: newTeamB,
        scoreHistory: [...state.scoreHistory, scoreEntry],
        selectedPlayerId: null,
        selectedTeamId: null,
    };
}

export function handleRemoveScore(state: Game, payload: PayloadOf<'REMOVE_SCORE'>): Game {
    const { entryId } = payload;
    const entry = state.scoreHistory.find(s => s.id === entryId);
    if (!entry) return state;

    const points = entry.points;
    const updateTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats, points: p.stats.points - points };
                // OGはシュート成績に数えていない（handleToggleOwnGoal）ので、
                // 戻す対象も無い。無条件に引くと成功・試投が負になる
                if (!entry.isOwnGoal) {
                    if (entry.scoreType === '2P') {
                        stats.twoPointMade--;
                        stats.twoPointAttempt--;
                    } else if (entry.scoreType === '3P') {
                        stats.threePointMade--;
                        stats.threePointAttempt--;
                    } else {
                        stats.freeThrowMade--;
                        stats.freeThrowAttempt--;
                    }
                }
                return { ...p, stats };
            })
        };
    };

    return {
        ...state,
        teamA: updateTeam(state.teamA, entry.teamId === 'teamA'),
        teamB: updateTeam(state.teamB, entry.teamId === 'teamB'),
        // 得点を1件削除すると後続エントリの累計がずれるため再計算（公式スコアシートの整合性維持）
        scoreHistory: recalculateRunningScores(state.scoreHistory.filter(s => s.id !== entryId)),
    };
}

export function handleEditScore(state: Game, payload: PayloadOf<'EDIT_SCORE'>): Game {
    const { entryId, newPlayerId, newScoreType } = payload;
    const entry = state.scoreHistory.find(s => s.id === entryId);
    if (!entry) return state;

    const oldPoints = entry.points;
    const newPoints = newScoreType === '3P' ? 3 : newScoreType === '2P' ? 2 : 1;

    // 元の選手からスタッツを減算
    const removeFromPlayer = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats, points: p.stats.points - oldPoints };
                // OGはシュート成績に数えていないので戻す対象も無い（handleToggleOwnGoal）
                if (!entry.isOwnGoal) {
                    if (entry.scoreType === '2P') { stats.twoPointMade--; stats.twoPointAttempt--; }
                    else if (entry.scoreType === '3P') { stats.threePointMade--; stats.threePointAttempt--; }
                    else { stats.freeThrowMade--; stats.freeThrowAttempt--; }
                }
                return { ...p, stats };
            })
        };
    };

    // 新しい選手にスタッツを加算
    const addToPlayer = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== newPlayerId) return p;
                const stats = { ...p.stats, points: p.stats.points + newPoints };
                // 付け替えてもOGはOGのまま（updatedEntryがフラグを引き継ぐ）。
                // 番号を借りただけの選手にシュートを打たせない
                if (!entry.isOwnGoal) {
                    if (newScoreType === '2P') { stats.twoPointMade++; stats.twoPointAttempt++; }
                    else if (newScoreType === '3P') { stats.threePointMade++; stats.threePointAttempt++; }
                    else { stats.freeThrowMade++; stats.freeThrowAttempt++; }
                }
                return { ...p, stats };
            })
        };
    };

    const newPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === newPlayerId);
    const updatedEntry: ScoreEntry = {
        ...entry,
        playerId: newPlayerId,
        playerNumber: newPlayer?.number || entry.playerNumber,
        scoreType: newScoreType,
        points: newPoints,
    };

    // まず元の選手から減算
    let teamA = removeFromPlayer(state.teamA, entry.teamId === 'teamA');
    let teamB = removeFromPlayer(state.teamB, entry.teamId === 'teamB');
    // 次に新しい選手に加算
    teamA = addToPlayer(teamA, entry.teamId === 'teamA');
    teamB = addToPlayer(teamB, entry.teamId === 'teamB');

    return {
        ...state,
        teamA,
        teamB,
        // 点数種別の変更で累計が変わるため再計算（公式スコアシートの整合性維持）
        scoreHistory: recalculateRunningScores(state.scoreHistory.map(s => s.id === entryId ? updatedEntry : s)),
    };
}

/**
 * 訂正後の記録を付ける選手を決める。
 *
 * 指定が無い、または指定された選手がそのチームに居ない場合は元の選手を返す。
 * チーム外を許すと、加算側の map が誰にも当たらずスタッツだけが消える
 * （減算は元のチームに対して走るため、合計が静かに減る）。
 */
function resolveTargetPlayer(
    state: Game,
    teamId: string,
    currentPlayerId: string,
    newPlayerId: string | undefined,
): { playerId: string; playerNumber: number | null } {
    const team = teamId === 'teamA' ? state.teamA : state.teamB;
    if (!newPlayerId || newPlayerId === currentPlayerId) {
        return { playerId: currentPlayerId, playerNumber: null };
    }
    const target = team.players.find(p => p.id === newPlayerId);
    if (!target) return { playerId: currentPlayerId, playerNumber: null };
    return { playerId: target.id, playerNumber: target.number };
}

export function handleConvertScoreToMiss(state: Game, payload: PayloadOf<'CONVERT_SCORE_TO_MISS'>): Game {
    // 成功 → ミスへの変換
    const { entryId, newMissType, newPlayerId } = payload;
    const entry = state.scoreHistory.find(s => s.id === entryId);
    if (!entry) return state;
    // 「入らなかったオウンゴール」は存在しない。通すと、番号を借りただけの選手に
    // 試投が付き（OGはシュート成績に数えていないので成功数が負にもなる）、
    // ▲の目印も失われる。UI側でも選ばせない（EditActionModal）
    if (entry.isOwnGoal) return state;

    const oldPoints = entry.points;
    const target = resolveTargetPlayer(state, entry.teamId, entry.playerId, newPlayerId);

    // 元の選手からスコア分を減算
    const removeScore = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats, points: p.stats.points - oldPoints };
                if (entry.scoreType === '2P') { stats.twoPointMade--; stats.twoPointAttempt--; }
                else if (entry.scoreType === '3P') { stats.threePointMade--; stats.threePointAttempt--; }
                else { stats.freeThrowMade--; stats.freeThrowAttempt--; }
                return { ...p, stats };
            })
        };
    };

    // ミスのアテンプトを加算（選手を付け替えたときは新しい選手へ）
    const addMiss = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== target.playerId) return p;
                const stats = { ...p.stats };
                if (newMissType === '2PA') { stats.twoPointAttempt++; }
                else if (newMissType === '3PA') { stats.threePointAttempt++; }
                else { stats.freeThrowAttempt++; }
                return { ...p, stats };
            })
        };
    };

    let teamA = removeScore(state.teamA, entry.teamId === 'teamA');
    let teamB = removeScore(state.teamB, entry.teamId === 'teamB');
    teamA = addMiss(teamA, entry.teamId === 'teamA');
    teamB = addMiss(teamB, entry.teamId === 'teamB');

    // 新しいStatEntryを作成
    const newStatEntry: StatEntry = {
        id: crypto.randomUUID(),
        teamId: entry.teamId,
        playerId: target.playerId,
        playerNumber: target.playerNumber ?? entry.playerNumber,
        statType: newMissType,
        quarter: entry.quarter,
        timestamp: entry.timestamp, // 元のタイムスタンプを維持
        // ファウルが生んだFTなら、ミスへ直しても由来を引き継ぐ。
        // 落とすとファウルを取り消しても試投だけが残る（StatEntry.sourceFoulId）
        ...(entry.sourceFoulId ? { sourceFoulId: entry.sourceFoulId } : {}),
    };

    // scoreHistoryから削除し、statHistoryに追加
    const newScoreHistory = state.scoreHistory.filter(s => s.id !== entryId);
    const newStatHistory = [...state.statHistory, newStatEntry];

    // ランニングスコアを再計算
    const recalculatedScoreHistory = recalculateRunningScores(newScoreHistory);

    return {
        ...state,
        teamA,
        teamB,
        scoreHistory: recalculatedScoreHistory,
        statHistory: newStatHistory,
    };
}

export function handleConvertMissToScore(state: Game, payload: PayloadOf<'CONVERT_MISS_TO_SCORE'>): Game {
    // ミス → 成功への変換
    const { entryId, newScoreType, newPlayerId } = payload;
    const entry = state.statHistory.find(s => s.id === entryId);
    if (!entry) return state;

    // 2PA, 3PA, FTA のみ変換可能
    if (!['2PA', '3PA', 'FTA'].includes(entry.statType)) return state;

    const newPoints = newScoreType === '3P' ? 3 : newScoreType === '2P' ? 2 : 1;
    const target = resolveTargetPlayer(state, entry.teamId, entry.playerId, newPlayerId);

    // 得点は必ず名簿の誰かに帰属させる。
    //
    // 保留を「選手不明」で解決した記録は playerId が 'unknown' で名簿の誰でもない。
    // そのまま成功へ変換すると、得点エントリだけが増えて選手の points はどこにも
    // 増えない。スコアボード・試合終了時の最終スコア・履歴の finalScore は選手の
    // 合計から、ランニングスコアと様式のピリオド別スコアは scoreHistory から
    // 出しているため、両者が食い違ったまま試合が保存される（実測: ボード0点・
    // シート2点）。さらに以後の ADD_SCORE が同じ累計値を持つことになり、様式の
    // ランニングスコア欄（累計値で1件だけ引く）で後の得点が印字されなくなる。
    //
    // 変換そのものを塞ぐわけではない。UI は不明の記録に対して先に選手を
    // 選ばせる（EditActionModal）。ここは、どの経路からでも帰属の無い得点を
    // 作らせないための最後の砦。
    const targetTeam = entry.teamId === 'teamA' ? state.teamA : state.teamB;
    if (!targetTeam.players.some(p => p.id === target.playerId)) return state;

    // 元の選手からミスのアテンプトを減算
    const removeMiss = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats };
                if (entry.statType === '2PA') { stats.twoPointAttempt--; }
                else if (entry.statType === '3PA') { stats.threePointAttempt--; }
                else if (entry.statType === 'FTA') { stats.freeThrowAttempt--; }
                return { ...p, stats };
            })
        };
    };

    // 得点を加算（選手を付け替えたときは新しい選手へ）
    const addScore = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== target.playerId) return p;
                const stats = { ...p.stats, points: p.stats.points + newPoints };
                if (newScoreType === '2P') { stats.twoPointMade++; stats.twoPointAttempt++; }
                else if (newScoreType === '3P') { stats.threePointMade++; stats.threePointAttempt++; }
                else { stats.freeThrowMade++; stats.freeThrowAttempt++; }
                return { ...p, stats };
            })
        };
    };

    let teamA = removeMiss(state.teamA, entry.teamId === 'teamA');
    let teamB = removeMiss(state.teamB, entry.teamId === 'teamB');
    teamA = addScore(teamA, entry.teamId === 'teamA');
    teamB = addScore(teamB, entry.teamId === 'teamB');

    // 新しいScoreEntryを作成（ランニングスコアは後で再計算）
    const newScoreEntry: ScoreEntry = {
        id: crypto.randomUUID(),
        teamId: entry.teamId,
        playerId: target.playerId,
        playerNumber: target.playerNumber ?? entry.playerNumber,
        scoreType: newScoreType,
        points: newPoints,
        quarter: entry.quarter,
        timestamp: entry.timestamp, // 元のタイムスタンプを維持
        runningScoreA: 0, // 後で再計算
        runningScoreB: 0, // 後で再計算
        // ミスへ直したときに引き継いだ由来を、成功へ戻すときも保つ。
        // 落とすとファウルとの紐付けが切れ、取り消しは「同じシューター・1秒以内」の
        // 旧データ向けの推測に頼ることになる。シューターを付け替えるとその推測が
        // 外れ、ファウルを消しても得点だけが残っていた
        ...(entry.sourceFoulId ? { sourceFoulId: entry.sourceFoulId } : {}),
    };

    // statHistoryから削除し、scoreHistoryに追加
    const newStatHistory = state.statHistory.filter(s => s.id !== entryId);
    const newScoreHistory = [...state.scoreHistory, newScoreEntry];

    // ランニングスコアを再計算
    const recalculatedScoreHistory = recalculateRunningScores(newScoreHistory);

    return {
        ...state,
        teamA,
        teamB,
        scoreHistory: recalculatedScoreHistory,
        statHistory: newStatHistory,
    };
}

export function handleToggleOwnGoal(state: Game, payload: PayloadOf<'TOGGLE_OWN_GOAL'>): Game {
    const { entryId } = payload;
    const entry = state.scoreHistory.find(s => s.id === entryId);
    if (!entry) return state;

    const nextOwnGoal = !entry.isOwnGoal;
    // 相手のオウンゴールで入った点は、番号を借りた選手が打ったシュートではない。
    // 成功・試投から外す（OGを解除したら戻す）。得点(points)はチーム得点・
    // ランニングスコア・最終スコアの導出元なので触らない
    const delta = nextOwnGoal ? -1 : 1;

    const updateTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const stats = { ...p.stats };
                if (entry.scoreType === '2P') { stats.twoPointMade += delta; stats.twoPointAttempt += delta; }
                else if (entry.scoreType === '3P') { stats.threePointMade += delta; stats.threePointAttempt += delta; }
                else { stats.freeThrowMade += delta; stats.freeThrowAttempt += delta; }
                return { ...p, stats };
            })
        };
    };

    return {
        ...state,
        teamA: updateTeam(state.teamA, entry.teamId === 'teamA'),
        teamB: updateTeam(state.teamB, entry.teamId === 'teamB'),
        scoreHistory: state.scoreHistory.map(s =>
            s.id === entryId ? { ...s, isOwnGoal: nextOwnGoal } : s
        ),
    };
}
