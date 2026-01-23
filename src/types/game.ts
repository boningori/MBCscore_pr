// ミニバスケットボール スコアシートアプリ 型定義

import type { PendingAction } from './pendingAction';

// 選手の統計データ
export interface PlayerStats {
    points: number;
    twoPointMade: number;
    twoPointAttempt: number;
    threePointMade: number;
    threePointAttempt: number;
    freeThrowMade: number;
    freeThrowAttempt: number;
    offensiveRebounds: number;
    defensiveRebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;        // 合計TO
    turnoverDD: number;       // ダブドリ
    turnoverTR: number;       // トラベ
    turnoverPM: number;       // パスミス
    turnoverCM: number;       // キャッチミス
}

// ファウルの種類
// P: パーソナル, T: テクニカル, BT: ベンチテクニカル, U: アンスポーツマンライク, D: ディスクォリファイイング, F: ファイティング
export type FoulType = 'P' | 'T' | 'BT' | 'U' | 'D' | 'F';

// フリースロー結果
export type FreeThrowResult = 'made' | 'missed';

// シュート状況（ファウル発生時）
export type ShotSituation = 'none' | '2P' | '3P';

// ファウル記録（選手のファウル履歴用）
export interface FoulRecord {
    type: FoulType;
    freeThrows: number;  // 0, 1, 2, 3
    freeThrowResults?: FreeThrowResult[];
}

// 出場種別: スターター（Q開始時の5人）または途中交代、または両方（スタメンが一度退いて再出場）
export type QuarterPlayType = 'starter' | 'sub' | 'both' | false;

// 選手
export interface Player {
    id: string;
    number: number;        // 背番号
    name: string;
    courtName?: string;    // コートネーム（ニックネーム）
    isCaptain: boolean;
    fouls: (FoulType | FoulRecord)[];     // ファウル履歴（レガシー: FoulType[], 新: FoulRecord[]）
    stats: PlayerStats;
    quartersPlayed: QuarterPlayType[];  // [Q1, Q2, Q3, Q4] 出場クォーター ('starter'=スタメン, 'sub'=途中交代, false=未出場)
    isOnCourt: boolean;    // コート上にいるか
}

// タイムアウト記録
export interface Timeout {
    quarter: number;
    elapsedMinutes: number;  // 経過時間（分）
}

// チーム
export interface Team {
    id: string;
    name: string;
    coachName: string;
    assistantCoachName: string;  // Aコーチ
    players: Player[];
    timeouts: Timeout[];
    teamFouls: number[];   // クォーター毎のチームファウル数 [Q1, Q2, Q3, Q4]
    coachFouls: FoulType[]; // コーチ・ベンチのファウル
    isMyTeam?: boolean;    // マインチームかどうか
    color: 'white' | 'blue'; // チームカラー
}

// スコア履歴
export interface ScoreEntry {
    id: string;
    teamId: string;
    playerId: string;
    playerNumber: number;
    scoreType: '2P' | '3P' | 'FT';
    points: number;
    quarter: number;
    timestamp: number;
    runningScoreA: number;  // その時点でのチームAの累計点
    runningScoreB: number;  // その時点でのチームBの累計点
}

// 統計アクション記録
export interface StatEntry {
    id: string;
    teamId: string;
    playerId: string;
    playerNumber: number;
    statType: 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK' | 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM' | '2PA' | '3PA' | 'FTA';
    quarter: number;
    timestamp: number;
}

// ファウル記録
export interface FoulEntry {
    id: string;
    teamId: string;
    playerId: string | null;  // COACH/BENCHの場合はnull
    playerNumber: number;      // コーチ・ベンチの場合は-1
    foulType: FoulType;
    quarter: number;
    timestamp: number;
    isCoachOrBench: boolean;   // コーチ・ベンチファウルかどうか
    // フリースロー関連（新規）
    freeThrows?: number;                    // FT本数 (0, 1, 2, 3)
    freeThrowResults?: FreeThrowResult[];   // FT結果
    shotSituation?: ShotSituation;          // シュート状況
    shooterTeamId?: string;                 // FTを打った選手のチーム
    shooterPlayerId?: string;               // FTを打った選手ID
    shooterPlayerNumber?: number;           // FTを打った選手の背番号
}

// ゲームの状態
export type GamePhase = 'setup' | 'playing' | 'paused' | 'quarterEnd' | 'finished';

// ゲーム
export interface Game {
    id: string;
    teamA: Team;
    teamB: Team;
    currentQuarter: number;  // 1-4
    phase: GamePhase;
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
    pendingActions: PendingAction[];  // 保留中のアクション
    selectedPlayerId: string | null;  // 現在選択中の選手
    selectedTeamId: string | null;    // 現在選択中のチーム
    startTime: Date | null;
    endTime: Date | null;
}

// アクション種別
export type GameActionType =
    | 'SET_TEAMS'
    | 'START_GAME'
    | 'PAUSE_GAME'
    | 'RESUME_GAME'
    | 'END_QUARTER'
    | 'END_GAME'
    | 'ADD_SCORE'
    | 'ADD_STAT'
    | 'ADD_FOUL'
    | 'ADD_FOUL_WITH_FREE_THROWS'
    | 'ADD_TIMEOUT'
    | 'SUBSTITUTE_PLAYER'
    | 'SELECT_PLAYER'
    | 'CLEAR_SELECTION'
    | 'UNDO_LAST_ACTION'
    | 'RESET_GAME'
    | 'REMOVE_SCORE'
    | 'REMOVE_STAT'
    | 'REMOVE_FOUL'
    | 'RESTORE_GAME'
    | 'EDIT_SCORE'
    | 'EDIT_STAT'
    | 'CONVERT_SCORE_TO_MISS'
    | 'CONVERT_MISS_TO_SCORE'
    | 'ADD_PENDING_ACTION'
    | 'RESOLVE_PENDING_ACTION'
    | 'RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE'
    | 'RESOLVE_PENDING_ACTION_WITH_FREE_THROWS'
    | 'RESOLVE_PENDING_ACTION_UNKNOWN'
    | 'UPDATE_PENDING_ACTION_CANDIDATES'
    | 'REMOVE_PENDING_ACTION';

// ゲームアクション
export interface GameAction {
    type: GameActionType;
    payload?: any;
}

// 初期選手統計
export const createInitialStats = (): PlayerStats => ({
    points: 0,
    twoPointMade: 0,
    twoPointAttempt: 0,
    threePointMade: 0,
    threePointAttempt: 0,
    freeThrowMade: 0,
    freeThrowAttempt: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    turnoverDD: 0,
    turnoverTR: 0,
    turnoverPM: 0,
    turnoverCM: 0,
});

// 初期選手作成
export const createPlayer = (id: string, number: number, name: string, isCaptain = false, courtName?: string): Player => ({
    id,
    number,
    name,
    courtName,
    isCaptain,
    fouls: [],
    stats: createInitialStats(),
    quartersPlayed: [false, false, false, false],
    isOnCourt: false,
});

// 初期チーム作成
export const createTeam = (id: string, name: string, coachName: string, assistantCoachName = ''): Team => ({
    id,
    name,
    coachName,
    assistantCoachName,
    players: [],
    timeouts: [],
    teamFouls: [0, 0, 0, 0],
    coachFouls: [],
    color: 'white', // デフォルト
});

// 初期ゲーム作成
export const createInitialGame = (): Game => ({
    id: crypto.randomUUID(),
    teamA: createTeam('teamA', '', ''),
    teamB: createTeam('teamB', '', ''),
    currentQuarter: 1,
    phase: 'setup',
    scoreHistory: [],
    statHistory: [],
    foulHistory: [],
    pendingActions: [],
    selectedPlayerId: null,
    selectedTeamId: null,
    startTime: null,
    endTime: null,
});

// ミニバスルール定数
export const MAX_QUARTERS = 4;
export const MAX_PERSONAL_FOULS = 5;
export const QUARTER_DURATION_SECONDS = 6 * 60; // 6分
export const TEAM_FOUL_LIMIT = 4;  // 5つ目からFT
export const MAX_PLAYERS_PER_TEAM = 15;
export const PLAYERS_ON_COURT = 5;

// ファウル表示用ヘルパー関数
export const formatFoulDisplay = (foul: FoulType | FoulRecord): string => {
    if (typeof foul === 'string') {
        return foul;  // レガシー形式
    }
    if (foul.freeThrows === 0 || foul.freeThrows === undefined) {
        return foul.type;
    }
    return `${foul.type}${foul.freeThrows}`;  // "P2", "T1" など
};

// ファウルタイプを取得するヘルパー
export const getFoulType = (foul: FoulType | FoulRecord): FoulType => {
    if (typeof foul === 'string') {
        return foul;
    }
    return foul.type;
};

// FT本数を取得するヘルパー
export const getFoulFreeThrows = (foul: FoulType | FoulRecord): number => {
    if (typeof foul === 'string') {
        return 0;
    }
    return foul.freeThrows || 0;
};

// FT移行判定ロジック
export const shouldShowFreeThrowInput = (
    foulType: FoulType,
    shotSituation: ShotSituation,
    teamFouls: number
): boolean => {
    // T/U/D は常にFT
    if (['T', 'U', 'D'].includes(foulType)) return true;

    // シュート中ならFT
    if (shotSituation !== 'none') return true;

    // チームファウル5個目以降（ペナルティ）ならFT
    if (teamFouls >= TEAM_FOUL_LIMIT) return true;

    return false;
};

// FT本数の自動推奨ロジック
export const suggestFreeThrowCount = (
    foulType: FoulType,
    teamFouls: number,
    shotSituation: ShotSituation
): number => {
    // T（テクニカル）は1本
    if (foulType === 'T' || foulType === 'BT') return 1;

    // U/D は2本
    if (['U', 'D'].includes(foulType)) return 2;

    // シュート中のファウル
    if (shotSituation === '3P') return 3;
    if (shotSituation === '2P') return 2;

    // チームファウル5個目以降（ペナルティ状態）は2本
    if (teamFouls >= TEAM_FOUL_LIMIT) return 2;

    // それ以外は0本
    return 0;
};
