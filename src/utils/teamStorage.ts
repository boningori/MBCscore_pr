// マイチーム永続保存用ストレージ

import type { Team } from '../types/game';
import { createTeam, createPlayer } from '../types/game';

const MY_TEAMS_KEY = 'minibasket-my-teams';
const OPPONENT_TEAMS_KEY = 'minibasket-opponent-teams';

// 保存用チームデータ（試合データを含まない軽量版）
export interface SavedTeam {
    id: string;
    name: string;
    coachName: string;
    assistantCoachName: string;  // Aコーチ
    players: SavedPlayer[];
    createdAt: string;
    updatedAt: string;
}

export interface SavedPlayer {
    number: number;
    name: string;
    courtName?: string;  // コートネーム（ニックネーム）
    isCaptain: boolean;
}

// TeamからSavedTeamへ変換
export function teamToSavedTeam(team: Team): SavedTeam {
    return {
        id: team.id,
        name: team.name,
        coachName: team.coachName,
        assistantCoachName: team.assistantCoachName || '',
        players: team.players.map(p => ({
            number: p.number,
            name: p.name,
            isCaptain: p.isCaptain,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

// SavedTeamからTeamへ変換
export function savedTeamToTeam(saved: SavedTeam, teamId: 'teamA' | 'teamB'): Team {
    const team = createTeam(teamId, saved.name, saved.coachName, saved.assistantCoachName || '');
    team.players = saved.players.map((p, index) =>
        createPlayer(
            `${teamId}-player-${index}`,
            p.number,
            p.name,
            p.isCaptain,
            p.courtName
        )
    );
    return team;
}

// マイチーム保存
export function saveMyTeam(team: SavedTeam): void {
    try {
        const teams = loadMyTeams();
        const existingIndex = teams.findIndex(t => t.id === team.id);

        if (existingIndex >= 0) {
            teams[existingIndex] = { ...team, updatedAt: new Date().toISOString() };
        } else {
            teams.push(team);
        }

        localStorage.setItem(MY_TEAMS_KEY, JSON.stringify(teams));
    } catch (error) {
        console.error('Failed to save my team:', error);
    }
}

// マイチーム一覧取得
export function loadMyTeams(): SavedTeam[] {
    try {
        const data = localStorage.getItem(MY_TEAMS_KEY);
        if (!data) return [];
        return JSON.parse(data) as SavedTeam[];
    } catch (error) {
        console.error('Failed to load my teams:', error);
        return [];
    }
}

// マイチーム取得（単一）
export function loadMyTeam(teamId: string): SavedTeam | null {
    const teams = loadMyTeams();
    return teams.find(t => t.id === teamId) || null;
}

// マイチーム削除
export function deleteMyTeam(teamId: string): void {
    try {
        const teams = loadMyTeams().filter(t => t.id !== teamId);
        localStorage.setItem(MY_TEAMS_KEY, JSON.stringify(teams));
    } catch (error) {
        console.error('Failed to delete my team:', error);
    }
}

// 最近使用した対戦チーム保存（最大10件）
export function saveRecentOpponent(team: SavedTeam): void {
    try {
        let teams = loadRecentOpponents();
        // 既存を削除して先頭に追加
        teams = teams.filter(t => t.id !== team.id);
        teams.unshift({ ...team, updatedAt: new Date().toISOString() });
        // 最大10件に制限
        teams = teams.slice(0, 10);
        localStorage.setItem(OPPONENT_TEAMS_KEY, JSON.stringify(teams));
    } catch (error) {
        console.error('Failed to save opponent team:', error);
    }
}

// 最近使用した対戦チーム取得
export function loadRecentOpponents(): SavedTeam[] {
    try {
        const data = localStorage.getItem(OPPONENT_TEAMS_KEY);
        if (!data) return [];
        return JSON.parse(data) as SavedTeam[];
    } catch (error) {
        console.error('Failed to load opponent teams:', error);
        return [];
    }
}

// 対戦チーム履歴クリア
export function clearRecentOpponents(): void {
    try {
        localStorage.removeItem(OPPONENT_TEAMS_KEY);
    } catch (error) {
        console.error('Failed to clear opponent teams:', error);
    }
}

// === 対戦チーム管理（永続保存） ===
const SAVED_OPPONENTS_KEY = 'minibasket-saved-opponents';

// 対戦チーム保存
export function saveOpponent(team: SavedTeam): void {
    try {
        const teams = loadOpponents();
        const existingIndex = teams.findIndex(t => t.id === team.id);

        if (existingIndex >= 0) {
            teams[existingIndex] = { ...team, updatedAt: new Date().toISOString() };
        } else {
            teams.push(team);
        }

        localStorage.setItem(SAVED_OPPONENTS_KEY, JSON.stringify(teams));
    } catch (error) {
        console.error('Failed to save opponent:', error);
    }
}

// 対戦チーム一覧取得
export function loadOpponents(): SavedTeam[] {
    try {
        const data = localStorage.getItem(SAVED_OPPONENTS_KEY);
        if (!data) return [];
        return JSON.parse(data) as SavedTeam[];
    } catch (error) {
        console.error('Failed to load opponents:', error);
        return [];
    }
}

// 対戦チーム削除
export function deleteOpponent(teamId: string): void {
    try {
        const teams = loadOpponents().filter(t => t.id !== teamId);
        localStorage.setItem(SAVED_OPPONENTS_KEY, JSON.stringify(teams));
    } catch (error) {
        console.error('Failed to delete opponent:', error);
    }
}

// 新規チームID生成
export function generateTeamId(): string {
    return `team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 空のSavedTeam作成
export function createEmptySavedTeam(): SavedTeam {
    return {
        id: generateTeamId(),
        name: '',
        coachName: '',
        assistantCoachName: '',
        players: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
