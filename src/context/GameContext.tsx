import React, { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type {
    Game,
    GameAction,
    Player,
    ScoreEntry,
    StatEntry,
    FoulEntry,
    FoulType,
} from '../types/game';
import type { PendingAction } from '../types/pendingAction';
import {
    createInitialGame,
    MAX_PERSONAL_FOULS,
} from '../types/game';

// Context
interface GameContextType {
    state: Game;
    dispatch: React.Dispatch<GameAction>;
    // ヘルパー関数
    getTeamScore: (teamId: string) => number;
    getPlayerById: (playerId: string) => Player | null;
    getPlayersOnCourt: (teamId: string) => Player[];
    getTeamFoulsInQuarter: (teamId: string, quarter: number) => number;
    canPlayerPlay: (player: Player) => boolean;
}

const GameContext = createContext<GameContextType | null>(null);

// ヘルパー関数: ランニングスコアを再計算
function recalculateRunningScores(
    scoreHistory: ScoreEntry[]
): ScoreEntry[] {
    // タイムスタンプ順にソート
    const sorted = [...scoreHistory].sort((a, b) => a.timestamp - b.timestamp);

    let runningA = 0;
    let runningB = 0;

    return sorted.map(entry => {
        runningA += entry.teamId === 'teamA' ? entry.points : 0;
        runningB += entry.teamId === 'teamB' ? entry.points : 0;
        return {
            ...entry,
            runningScoreA: runningA,
            runningScoreB: runningB,
        };
    });
}

// Reducer
function gameReducer(state: Game, action: GameAction): Game {
    switch (action.type) {
        case 'SET_TEAMS': {
            const { teamA, teamB } = action.payload;
            // デフォルトカラー設定（setupデータから来る場合は上書きされる可能性があるが、ここで保証する）
            const teamAWithColor = { ...teamA, color: teamA.color || 'white' };
            const teamBWithColor = { ...teamB, color: teamB.color || 'blue' };
            return { ...state, teamA: teamAWithColor, teamB: teamBWithColor };
        }

        case 'START_GAME': {
            // コート上の選手の出場時限を記録
            const updateQuarters = (team: typeof state.teamA) => ({
                ...team,
                players: team.players.map(p => ({
                    ...p,
                    quartersPlayed: p.isOnCourt
                        ? p.quartersPlayed.map((q, i) => i === state.currentQuarter - 1 ? true : q)
                        : p.quartersPlayed
                }))
            });
            return {
                ...state,
                phase: 'playing',
                teamA: updateQuarters(state.teamA),
                teamB: updateQuarters(state.teamB),
                startTime: state.startTime || new Date(),
            };
        }

        case 'PAUSE_GAME':
            return { ...state, phase: 'paused' };

        case 'RESUME_GAME':
            return { ...state, phase: 'playing' };

        case 'END_QUARTER': {
            const nextQuarter = state.currentQuarter + 1;
            if (nextQuarter > 4) {
                return { ...state, phase: 'finished', endTime: new Date() };
            }
            return {
                ...state,
                currentQuarter: nextQuarter,
                phase: 'quarterEnd',
            };
        }

        case 'END_GAME':
            return { ...state, phase: 'finished', endTime: new Date() };



        case 'ADD_SCORE': {
            const { teamId, playerId, scoreType } = action.payload as {
                teamId: string;
                playerId: string;
                scoreType: '2P' | '3P' | 'FT'
            };
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
                id: crypto.randomUUID(),
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

        case 'ADD_STAT': {
            const { teamId, playerId, statType } = action.payload as {
                teamId: string;
                playerId: string;
                statType: 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM' | '2PA' | '3PA' | 'FTA';
            };

            const updatePlayerStat = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;
                return {
                    ...team,
                    players: team.players.map(p => {
                        if (p.id !== playerId) return p;
                        const stats = { ...p.stats };
                        switch (statType) {
                            case 'OREB': stats.offensiveRebounds++; break;
                            case 'DREB': stats.defensiveRebounds++; break;
                            case 'AST': stats.assists++; break;
                            case 'STL': stats.steals++; break;
                            case 'BLK': stats.blocks++; break;
                            case 'TO': stats.turnovers++; break;
                            case 'TO:DD': stats.turnovers++; stats.turnoverDD++; break;
                            case 'TO:TR': stats.turnovers++; stats.turnoverTR++; break;
                            case 'TO:PM': stats.turnovers++; stats.turnoverPM++; break;
                            case 'TO:CM': stats.turnovers++; stats.turnoverCM++; break;
                            case '2PA': stats.twoPointAttempt++; break;
                            case '3PA': stats.threePointAttempt++; break;
                            case 'FTA': stats.freeThrowAttempt++; break;
                        }
                        return { ...p, stats };
                    })
                };
            };

            const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
            const statEntry: StatEntry = {
                id: crypto.randomUUID(),
                teamId,
                playerId,
                playerNumber: player?.number || 0,
                statType,
                quarter: state.currentQuarter,
                timestamp: Date.now(),
            };

            return {
                ...state,
                teamA: updatePlayerStat(state.teamA, teamId === 'teamA'),
                teamB: updatePlayerStat(state.teamB, teamId === 'teamB'),
                statHistory: [...state.statHistory, statEntry],
                selectedPlayerId: null,
                selectedTeamId: null,
            };
        }

        case 'ADD_FOUL': {
            const { teamId, playerId, foulType } = action.payload as {
                teamId: string;
                playerId: string | null;
                foulType: FoulType;
            };

            const isCoachOrBench = playerId === 'COACH' || playerId === 'BENCH' || !playerId;
            const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);

            const updateTeamFoul = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;

                // コーチ・ベンチファウル（テクニカル）はチームファウルに数えない
                if (playerId === 'COACH' || playerId === 'BENCH') {
                    return {
                        ...team,
                        coachFouls: [...team.coachFouls, foulType],
                    };
                }

                // ベンチテクニカル等（playerId が null）もチームファウルに数えない
                if (!playerId) {
                    return {
                        ...team,
                        coachFouls: [...team.coachFouls, foulType],
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

        case 'ADD_TIMEOUT': {
            const { teamId, elapsedMinutes } = action.payload as {
                teamId: string;
                elapsedMinutes: number;
            };

            const updateTeamTimeout = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;
                return {
                    ...team,
                    timeouts: [...team.timeouts, { quarter: state.currentQuarter, elapsedMinutes }]
                };
            };

            return {
                ...state,
                teamA: updateTeamTimeout(state.teamA, teamId === 'teamA'),
                teamB: updateTeamTimeout(state.teamB, teamId === 'teamB'),
            };
        }

        case 'SUBSTITUTE_PLAYER': {
            const { teamId, playerInId, playerOutId } = action.payload as {
                teamId: string;
                playerInId: string;
                playerOutId: string;
            };

            const updateTeamSubstitution = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;
                return {
                    ...team,
                    players: team.players.map(p => {
                        if (p.id === playerInId) {
                            const quartersPlayed = [...p.quartersPlayed];
                            quartersPlayed[state.currentQuarter - 1] = true;
                            return { ...p, isOnCourt: true, quartersPlayed };
                        }
                        if (p.id === playerOutId) {
                            return { ...p, isOnCourt: false };
                        }
                        return p;
                    })
                };
            };

            return {
                ...state,
                teamA: updateTeamSubstitution(state.teamA, teamId === 'teamA'),
                teamB: updateTeamSubstitution(state.teamB, teamId === 'teamB'),
            };
        }

        case 'SELECT_PLAYER': {
            const { playerId, teamId } = action.payload;
            return { ...state, selectedPlayerId: playerId, selectedTeamId: teamId };
        }

        case 'CLEAR_SELECTION':
            return { ...state, selectedPlayerId: null, selectedTeamId: null };

        case 'UNDO_LAST_ACTION': {
            // TODO: 実装
            return state;
        }

        case 'RESET_GAME':
            return createInitialGame();

        case 'REMOVE_SCORE': {
            const { entryId } = action.payload as { entryId: string };
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
                        return { ...p, stats };
                    })
                };
            };

            return {
                ...state,
                teamA: updateTeam(state.teamA, entry.teamId === 'teamA'),
                teamB: updateTeam(state.teamB, entry.teamId === 'teamB'),
                scoreHistory: state.scoreHistory.filter(s => s.id !== entryId),
            };
        }

        case 'REMOVE_STAT': {
            const { entryId } = action.payload as { entryId: string };
            const entry = state.statHistory.find(s => s.id === entryId);
            if (!entry) return state;

            const updateTeam = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;
                return {
                    ...team,
                    players: team.players.map(p => {
                        if (p.id !== entry.playerId) return p;
                        const stats = { ...p.stats };
                        switch (entry.statType) {
                            case 'OREB': stats.offensiveRebounds--; break;
                            case 'DREB': stats.defensiveRebounds--; break;
                            case 'AST': stats.assists--; break;
                            case 'STL': stats.steals--; break;
                            case 'BLK': stats.blocks--; break;
                            case 'TO': stats.turnovers--; break;
                            case 'TO:DD': stats.turnovers--; stats.turnoverDD--; break;
                            case 'TO:TR': stats.turnovers--; stats.turnoverTR--; break;
                            case 'TO:PM': stats.turnovers--; stats.turnoverPM--; break;
                            case 'TO:CM': stats.turnovers--; stats.turnoverCM--; break;
                            case '2PA': stats.twoPointAttempt--; break;
                            case '3PA': stats.threePointAttempt--; break;
                            case 'FTA': stats.freeThrowAttempt--; break;
                        }
                        return { ...p, stats };
                    })
                };
            };

            return {
                ...state,
                teamA: updateTeam(state.teamA, entry.teamId === 'teamA'),
                teamB: updateTeam(state.teamB, entry.teamId === 'teamB'),
                statHistory: state.statHistory.filter(s => s.id !== entryId),
            };
        }

        case 'REMOVE_FOUL': {
            const { entryId } = action.payload as { entryId: string };
            const entry = state.foulHistory.find(f => f.id === entryId);
            if (!entry) return state;

            const updateTeam = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;

                // コーチ・ベンチファウルの削除
                if (entry.isCoachOrBench) {
                    const coachFoulIndex = team.coachFouls.findIndex(f => f === entry.foulType);
                    if (coachFoulIndex !== -1) {
                        const newCoachFouls = [...team.coachFouls];
                        newCoachFouls.splice(coachFoulIndex, 1);
                        return { ...team, coachFouls: newCoachFouls };
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
                        const foulIndex = p.fouls.findIndex(f => f === entry.foulType);
                        if (foulIndex !== -1) {
                            const fouls = [...p.fouls];
                            fouls.splice(foulIndex, 1);
                            return { ...p, fouls };
                        }
                        return p;
                    })
                };
            };

            return {
                ...state,
                teamA: updateTeam(state.teamA, entry.teamId === 'teamA'),
                teamB: updateTeam(state.teamB, entry.teamId === 'teamB'),
                foulHistory: state.foulHistory.filter(f => f.id !== entryId),
            };
        }

        case 'RESTORE_GAME': {
            const { game } = action.payload as { game: Game };
            return game;
        }

        case 'EDIT_SCORE': {
            const { entryId, newPlayerId, newScoreType } = action.payload as {
                entryId: string;
                newPlayerId: string;
                newScoreType: '2P' | '3P' | 'FT';
            };
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
                        if (entry.scoreType === '2P') { stats.twoPointMade--; stats.twoPointAttempt--; }
                        else if (entry.scoreType === '3P') { stats.threePointMade--; stats.threePointAttempt--; }
                        else { stats.freeThrowMade--; stats.freeThrowAttempt--; }
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
                        if (newScoreType === '2P') { stats.twoPointMade++; stats.twoPointAttempt++; }
                        else if (newScoreType === '3P') { stats.threePointMade++; stats.threePointAttempt++; }
                        else { stats.freeThrowMade++; stats.freeThrowAttempt++; }
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
                scoreHistory: state.scoreHistory.map(s => s.id === entryId ? updatedEntry : s),
            };
        }

        case 'EDIT_STAT': {
            const { entryId, newPlayerId, newStatType } = action.payload as {
                entryId: string;
                newPlayerId: string;
                newStatType: 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | '2PA' | '3PA' | 'FTA';
            };
            const entry = state.statHistory.find(s => s.id === entryId);
            if (!entry) return state;

            // 元の選手からスタッツを減算
            const removeFromPlayer = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;
                return {
                    ...team,
                    players: team.players.map(p => {
                        if (p.id !== entry.playerId) return p;
                        const stats = { ...p.stats };
                        switch (entry.statType) {
                            case 'OREB': stats.offensiveRebounds--; break;
                            case 'DREB': stats.defensiveRebounds--; break;
                            case 'AST': stats.assists--; break;
                            case 'STL': stats.steals--; break;
                            case 'BLK': stats.blocks--; break;
                            case 'TO': stats.turnovers--; break;
                            case '2PA': stats.twoPointAttempt--; break;
                            case '3PA': stats.threePointAttempt--; break;
                            case 'FTA': stats.freeThrowAttempt--; break;
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
                        const stats = { ...p.stats };
                        switch (newStatType) {
                            case 'OREB': stats.offensiveRebounds++; break;
                            case 'DREB': stats.defensiveRebounds++; break;
                            case 'AST': stats.assists++; break;
                            case 'STL': stats.steals++; break;
                            case 'BLK': stats.blocks++; break;
                            case 'TO': stats.turnovers++; break;
                            case '2PA': stats.twoPointAttempt++; break;
                            case '3PA': stats.threePointAttempt++; break;
                            case 'FTA': stats.freeThrowAttempt++; break;
                        }
                        return { ...p, stats };
                    })
                };
            };

            const newPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === newPlayerId);
            const updatedEntry: StatEntry = {
                ...entry,
                playerId: newPlayerId,
                playerNumber: newPlayer?.number || entry.playerNumber,
                statType: newStatType,
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
                statHistory: state.statHistory.map(s => s.id === entryId ? updatedEntry : s),
            };
        }

        // ヘルパー関数: ランニングスコアを再計算
        case 'CONVERT_SCORE_TO_MISS': {
            // 成功 → ミスへの変換
            const { entryId, newMissType } = action.payload as {
                entryId: string;
                newMissType: '2PA' | '3PA' | 'FTA';
            };
            const entry = state.scoreHistory.find(s => s.id === entryId);
            if (!entry) return state;

            const oldPoints = entry.points;

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

            // ミスのアテンプトを加算
            const addMiss = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;
                return {
                    ...team,
                    players: team.players.map(p => {
                        if (p.id !== entry.playerId) return p;
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
                playerId: entry.playerId,
                playerNumber: entry.playerNumber,
                statType: newMissType,
                quarter: entry.quarter,
                timestamp: entry.timestamp, // 元のタイムスタンプを維持
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

        case 'CONVERT_MISS_TO_SCORE': {
            // ミス → 成功への変換
            const { entryId, newScoreType } = action.payload as {
                entryId: string;
                newScoreType: '2P' | '3P' | 'FT';
            };
            const entry = state.statHistory.find(s => s.id === entryId);
            if (!entry) return state;

            // 2PA, 3PA, FTA のみ変換可能
            if (!['2PA', '3PA', 'FTA'].includes(entry.statType)) return state;

            const newPoints = newScoreType === '3P' ? 3 : newScoreType === '2P' ? 2 : 1;

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

            // 得点を加算
            const addScore = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;
                return {
                    ...team,
                    players: team.players.map(p => {
                        if (p.id !== entry.playerId) return p;
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
                playerId: entry.playerId,
                playerNumber: entry.playerNumber,
                scoreType: newScoreType,
                points: newPoints,
                quarter: entry.quarter,
                timestamp: entry.timestamp, // 元のタイムスタンプを維持
                runningScoreA: 0, // 後で再計算
                runningScoreB: 0, // 後で再計算
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

        case 'ADD_PENDING_ACTION': {
            const pendingAction = action.payload as PendingAction;
            return {
                ...state,
                pendingActions: [...state.pendingActions, pendingAction],
            };
        }

        case 'RESOLVE_PENDING_ACTION': {
            const { pendingActionId, playerId } = action.payload as {
                pendingActionId: string;
                playerId: string;
            };
            const pending = state.pendingActions.find(p => p.id === pendingActionId);
            if (!pending) return state;

            // 保留アクションを正式な履歴に変換
            let newState = { ...state };
            const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
            if (!player) return state;

            if (pending.actionType === 'SCORE') {
                const scoreType = pending.value as '2P' | '3P' | 'FT';
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

                const newTeamA = updateTeamScore(state.teamA, pending.teamId === 'teamA');
                const newTeamB = updateTeamScore(state.teamB, pending.teamId === 'teamB');

                const scoreEntry: ScoreEntry = {
                    id: crypto.randomUUID(),
                    teamId: pending.teamId,
                    playerId,
                    playerNumber: player.number,
                    scoreType,
                    points,
                    quarter: pending.quarter,
                    timestamp: pending.timestamp,
                    runningScoreA: newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0),
                    runningScoreB: newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0),
                };

                newState = {
                    ...newState,
                    teamA: newTeamA,
                    teamB: newTeamB,
                    scoreHistory: [...newState.scoreHistory, scoreEntry],
                };
            } else if (pending.actionType === 'STAT') {
                const statType = pending.value as 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM' | '2PA' | '3PA' | 'FTA';

                const updatePlayerStat = (team: typeof state.teamA, isTarget: boolean) => {
                    if (!isTarget) return team;
                    return {
                        ...team,
                        players: team.players.map(p => {
                            if (p.id !== playerId) return p;
                            const stats = { ...p.stats };
                            switch (statType) {
                                case 'OREB': stats.offensiveRebounds++; break;
                                case 'DREB': stats.defensiveRebounds++; break;
                                case 'AST': stats.assists++; break;
                                case 'STL': stats.steals++; break;
                                case 'BLK': stats.blocks++; break;
                                case 'TO': stats.turnovers++; break;
                                case 'TO:DD': stats.turnovers++; stats.turnoverDD++; break;
                                case 'TO:TR': stats.turnovers++; stats.turnoverTR++; break;
                                case 'TO:PM': stats.turnovers++; stats.turnoverPM++; break;
                                case 'TO:CM': stats.turnovers++; stats.turnoverCM++; break;
                                case '2PA': stats.twoPointAttempt++; break;
                                case '3PA': stats.threePointAttempt++; break;
                                case 'FTA': stats.freeThrowAttempt++; break;
                            }
                            return { ...p, stats };
                        })
                    };
                };

                const statEntry: StatEntry = {
                    id: crypto.randomUUID(),
                    teamId: pending.teamId,
                    playerId,
                    playerNumber: player.number,
                    statType,
                    quarter: pending.quarter,
                    timestamp: pending.timestamp,
                };

                newState = {
                    ...newState,
                    teamA: updatePlayerStat(newState.teamA, pending.teamId === 'teamA'),
                    teamB: updatePlayerStat(newState.teamB, pending.teamId === 'teamB'),
                    statHistory: [...newState.statHistory, statEntry],
                };
            } else if (pending.actionType === 'FOUL') {
                const foulType = pending.value as FoulType;
                const updateTeamFoul = (team: typeof state.teamA, isTarget: boolean) => {
                    if (!isTarget) return team;
                    const newTeamFouls = [...team.teamFouls];
                    newTeamFouls[pending.quarter - 1]++;
                    return {
                        ...team,
                        teamFouls: newTeamFouls,
                        players: team.players.map(p => {
                            if (p.id !== playerId) return p;
                            return { ...p, fouls: [...p.fouls, foulType] };
                        })
                    };
                };

                newState = {
                    ...newState,
                    teamA: updateTeamFoul(newState.teamA, pending.teamId === 'teamA'),
                    teamB: updateTeamFoul(newState.teamB, pending.teamId === 'teamB'),
                };
            }

            return {
                ...newState,
                pendingActions: newState.pendingActions.filter(p => p.id !== pendingActionId),
            };
        }

        case 'UPDATE_PENDING_ACTION_CANDIDATES': {
            const { pendingActionId, candidatePlayerIds } = action.payload as {
                pendingActionId: string;
                candidatePlayerIds: string[];
            };
            return {
                ...state,
                pendingActions: state.pendingActions.map(p =>
                    p.id === pendingActionId ? { ...p, candidatePlayerIds } : p
                ),
            };
        }

        case 'REMOVE_PENDING_ACTION': {
            const { pendingActionId } = action.payload as { pendingActionId: string };
            return {
                ...state,
                pendingActions: state.pendingActions.filter(p => p.id !== pendingActionId),
            };
        }

        case 'RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE': {
            const { pendingActionId, playerId, foulType } = action.payload as {
                pendingActionId: string;
                playerId: string;
                foulType: FoulType;
            };
            const pending = state.pendingActions.find(p => p.id === pendingActionId);
            if (!pending || pending.actionType !== 'FOUL') return state;

            const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
            if (!player) return state;

            const updateTeamFoul = (team: typeof state.teamA, isTarget: boolean) => {
                if (!isTarget) return team;
                const newTeamFouls = [...team.teamFouls];
                newTeamFouls[pending.quarter - 1]++;
                return {
                    ...team,
                    teamFouls: newTeamFouls,
                    players: team.players.map(p => {
                        if (p.id !== playerId) return p;
                        return { ...p, fouls: [...p.fouls, foulType] };
                    })
                };
            };

            return {
                ...state,
                teamA: updateTeamFoul(state.teamA, pending.teamId === 'teamA'),
                teamB: updateTeamFoul(state.teamB, pending.teamId === 'teamB'),
                pendingActions: state.pendingActions.filter(p => p.id !== pendingActionId),
            };
        }

        case 'RESOLVE_PENDING_ACTION_UNKNOWN': {
            // 選手不明としてアクションを記録（統計履歴には残すが個人統計には加算しない）
            const { pendingActionId } = action.payload as { pendingActionId: string };
            const pending = state.pendingActions.find(p => p.id === pendingActionId);
            if (!pending) return state;

            let newState = { ...state };

            // STAT アクションのみ対応（不明選手の得点やファウルは記録すべきでない）
            if (pending.actionType === 'STAT') {
                const statType = pending.value as 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | '2PA' | '3PA' | 'FTA';

                const statEntry: StatEntry = {
                    id: crypto.randomUUID(),
                    teamId: pending.teamId,
                    playerId: 'unknown',  // 不明選手
                    playerNumber: -1,     // 不明選手は-1
                    statType,
                    quarter: pending.quarter,
                    timestamp: pending.timestamp,
                };

                newState = {
                    ...newState,
                    statHistory: [...newState.statHistory, statEntry],
                };
            }

            return {
                ...newState,
                pendingActions: newState.pendingActions.filter(p => p.id !== pendingActionId),
            };
        }

        default:
            return state;
    }
}

// Provider
export function GameProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(gameReducer, createInitialGame());

    // ヘルパー関数
    const getTeamScore = (teamId: string): number => {
        const team = teamId === 'teamA' ? state.teamA : state.teamB;
        return team.players.reduce((sum, p) => sum + p.stats.points, 0);
    };

    const getPlayerById = (playerId: string): Player | null => {
        return [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId) || null;
    };

    const getPlayersOnCourt = (teamId: string): Player[] => {
        const team = teamId === 'teamA' ? state.teamA : state.teamB;
        return team.players.filter(p => p.isOnCourt);
    };

    const getTeamFoulsInQuarter = (teamId: string, quarter: number): number => {
        const team = teamId === 'teamA' ? state.teamA : state.teamB;
        return team.teamFouls[quarter - 1] || 0;
    };

    const canPlayerPlay = (player: Player): boolean => {
        return player.fouls.length < MAX_PERSONAL_FOULS;
    };

    return (
        <GameContext.Provider value={{
            state,
            dispatch,
            getTeamScore,
            getPlayerById,
            getPlayersOnCourt,
            getTeamFoulsInQuarter,
            canPlayerPlay,
        }}>
            {children}
        </GameContext.Provider>
    );
}

// Hook
export function useGame() {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
}
