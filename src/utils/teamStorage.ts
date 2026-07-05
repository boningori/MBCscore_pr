// マイチーム永続保存用ストレージ

import type { Team } from '../types/game';
import { createTeam, createPlayer } from '../types/game';
import { createJsonStorage } from './createStorage';

const MY_TEAMS_KEY = 'minibasket-my-teams';
const OPPONENT_TEAMS_KEY = 'minibasket-opponent-teams';
const SAVED_OPPONENTS_KEY = 'minibasket-saved-opponents';

const myTeamsStorage = createJsonStorage<SavedTeam[]>(MY_TEAMS_KEY, [], 'my team');
const recentOpponentsStorage = createJsonStorage<SavedTeam[]>(OPPONENT_TEAMS_KEY, [], 'recent opponent');
const opponentsStorage = createJsonStorage<SavedTeam[]>(SAVED_OPPONENTS_KEY, [], 'opponent');

// 保存用チームデータ（試合データを含まない軽量版）
export interface SavedTeam {
    id: string;
    name: string;
    coachName: string;
    coachLicenseNo?: string;          // コーチ ライセンスNo.（JBA登録番号・半角英数10桁）
    assistantCoachName: string;       // Aコーチ
    assistantCoachLicenseNo?: string; // Aコーチ ライセンスNo.（JBA登録番号・半角英数10桁）
    players: SavedPlayer[];
    createdAt: string;
    updatedAt: string;
}

export interface SavedPlayer {
    number: number;              // デフォルト番号（後方互換性用）
    bibNumber?: number;          // ビブス番号（0-99）
    uniformNumber?: number;      // ユニフォーム番号（0-99）
    name: string;
    courtName?: string;          // コートネーム（ニックネーム）
    licenseNo?: string;          // ライセンスNo.（JBA登録番号・半角英数10桁）
    isCaptain: boolean;
}

// 番号タイプ（試合で使用する番号の種類）
export type NumberType = 'bib' | 'uniform';

// 選手の使用番号を取得（フォールバック付き）
export function getPlayerNumber(player: SavedPlayer, numberType: NumberType): number {
    if (numberType === 'bib') {
        return player.bibNumber ?? player.uniformNumber ?? player.number;
    } else {
        return player.uniformNumber ?? player.bibNumber ?? player.number;
    }
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
// numberType: マイチームの場合に使用する番号タイプ（対戦チームはnumberをそのまま使用）
export function savedTeamToTeam(saved: SavedTeam, teamId: 'teamA' | 'teamB', numberType?: NumberType): Team {
    const team = createTeam(teamId, saved.name, saved.coachName, saved.assistantCoachName || '', saved.coachLicenseNo, saved.assistantCoachLicenseNo);
    team.players = saved.players.map((p, index) => {
        // numberTypeが指定されている場合は該当する番号を使用（マイチーム用）
        const playerNumber = numberType ? getPlayerNumber(p, numberType) : p.number;
        return createPlayer(
            `${teamId}-player-${index}`,
            playerNumber,
            p.name,
            p.isCaptain,
            p.courtName,
            p.licenseNo
        );
    });
    return team;
}

// マイチーム保存
export function saveMyTeam(team: SavedTeam): void {
    const teams = loadMyTeams();
    const existingIndex = teams.findIndex(t => t.id === team.id);

    if (existingIndex >= 0) {
        teams[existingIndex] = { ...team, updatedAt: new Date().toISOString() };
    } else {
        teams.push(team);
    }

    myTeamsStorage.save(teams);
}

// マイチーム一覧取得
export function loadMyTeams(): SavedTeam[] {
    return myTeamsStorage.load();
}

// マイチーム取得（単一）
export function loadMyTeam(teamId: string): SavedTeam | null {
    const teams = loadMyTeams();
    return teams.find(t => t.id === teamId) || null;
}

// マイチーム削除
export function deleteMyTeam(teamId: string): void {
    const teams = loadMyTeams().filter(t => t.id !== teamId);
    myTeamsStorage.save(teams);
}

// 最近使用した対戦チーム保存（最大10件）
export function saveRecentOpponent(team: SavedTeam): void {
    let teams = loadRecentOpponents();
    // 既存を削除して先頭に追加
    teams = teams.filter(t => t.id !== team.id);
    teams.unshift({ ...team, updatedAt: new Date().toISOString() });
    // 最大10件に制限
    teams = teams.slice(0, 10);
    recentOpponentsStorage.save(teams);
}

// 最近使用した対戦チーム取得
export function loadRecentOpponents(): SavedTeam[] {
    return recentOpponentsStorage.load();
}

// 対戦チーム履歴クリア
export function clearRecentOpponents(): void {
    recentOpponentsStorage.clear();
}

// === 対戦チーム管理（永続保存） ===

// 対戦チーム保存
export function saveOpponent(team: SavedTeam): void {
    const teams = loadOpponents();
    const existingIndex = teams.findIndex(t => t.id === team.id);

    if (existingIndex >= 0) {
        teams[existingIndex] = { ...team, updatedAt: new Date().toISOString() };
    } else {
        teams.push(team);
    }

    opponentsStorage.save(teams);
}

// 対戦チーム一覧取得
export function loadOpponents(): SavedTeam[] {
    return opponentsStorage.load();
}

// 対戦チーム削除
export function deleteOpponent(teamId: string): void {
    const teams = loadOpponents().filter(t => t.id !== teamId);
    opponentsStorage.save(teams);
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
        coachLicenseNo: '',
        assistantCoachName: '',
        assistantCoachLicenseNo: '',
        players: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
