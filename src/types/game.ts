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
    licenseNo?: string;    // ライセンスNo.（JBA登録番号の下3桁）
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
    coachLicenseNo?: string;     // コーチ ライセンスNo.
    assistantCoachName: string;  // Aコーチ
    assistantCoachLicenseNo?: string; // Aコーチ ライセンスNo.
    players: Player[];
    timeouts: Timeout[];
    teamFouls: number[];   // クォーター毎のチームファウル数 [Q1, Q2, Q3, Q4]
    coachFouls: FoulType[]; // コーチのファウル
    assistantCoachFouls: FoulType[]; // A.コーチのファウル
    benchFouls: FoulType[]; // ベンチのファウル
    isMyTeam?: boolean;    // マインチームかどうか
    // 元になった SavedTeam の id。マイチーム側にだけ入れる。
    //
    // savedTeamToTeam で SavedTeam を写した時点で id は 'teamA'/'teamB' に
    // 変わるため、これが無いと保存後は名前でしか登録チームと結び付けられず、
    // 改名した瞬間に過去の試合が選手スタッツ分析から消える。
    //
    // 相手チーム側にはあえて入れない。自分の別チームを「相手チーム」として
    // 登録して記録した練習試合（6年 vs 5年）は、いま 5年 側の名前照合で
    // 拾えている。相手側に相手レコードの id が入ると id 照合が外れ、その
    // 試合が 5年 の分析から消える。未設定なら名前照合へ落ちて現状を保てる。
    savedTeamId?: string;
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
    isOwnGoal?: boolean;    // オウンゴール（自殺点）フラグ
    // このエントリを生成したファウル（FT・バスケットカウント）のID。
    // ファウルを取り消したときに戻す得点を確実に特定するために持つ。
    // 以前は「同じシューター・1秒以内」で推測していたため、履歴編集で
    // シューターを付け替えると取り消しに失敗して得点だけが残っていた。
    // 旧データには無いので、読む側は未設定を許容すること。
    sourceFoulId?: string;
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
    // このFTAを生んだファウルのID（ScoreEntry.sourceFoulId と同じ役割）。
    //
    // ファウルで得たFTを「やっぱり外していた」と直すと、得点エントリがこのFTAへ
    // 化ける（handleConvertScoreToMiss）。紐付けが無いとファウルを取り消しても
    // 残り、シューターに原因の無い試投が付いたままになる。フリースローは
    // ファウル無しには発生しないので、対で消えなければならない。
    // 自分で記録したFTミスには付かない。旧データにも無いので未設定を許容すること。
    sourceFoulId?: string;
}

// コーチ・ベンチファウルの種別
export type CoachFoulTarget = 'COACH' | 'ACOACH' | 'BENCH' | null;

// ファウル記録
export interface FoulEntry {
    id: string;
    teamId: string;
    playerId: string | null;  // COACH/ACOACH/BENCHの場合はnull
    playerNumber: number;      // コーチ・ベンチの場合は-1
    foulType: FoulType;
    quarter: number;
    timestamp: number;
    isCoachOrBench: boolean;   // コーチ・ベンチファウルかどうか
    coachFoulTarget?: CoachFoulTarget;  // コーチ・A.コーチ・ベンチの区別
    // フリースロー関連（新規）
    freeThrows?: number;                    // FT本数 (0, 1, 2, 3)
    freeThrowResults?: FreeThrowResult[];   // FT結果
    shotSituation?: ShotSituation;          // シュート状況
    shotMade?: boolean;                     // シュート成功（バスケットカウント）
    shooterTeamId?: string;                 // FTを打った選手のチーム
    shooterPlayerId?: string;               // FTを打った選手ID
    shooterPlayerNumber?: number;           // FTを打った選手の背番号
}

// ゲームの状態
export type GamePhase = 'setup' | 'playing' | 'paused' | 'quarterEnd' | 'finished';

// 試合情報（審判員・会場など）
export interface GameInfo {
    venue: string;              // 会場
    time: string;               // 開始時間（表示用 HH:MM）
    gameNo: string;             // Game No.
    crewChief: string;          // クルーチーフ
    umpire: string;             // アンパイア
    scorer: string;             // スコアラー
    assistantScorer: string;    // A・スコアラー
    timer: string;              // タイマー
    shotClockOperator: string;  // ショットクロックオペレーター
}

// 初期試合情報
export const createInitialGameInfo = (): GameInfo => ({
    venue: '',
    time: '',
    gameNo: '',
    crewChief: '',
    umpire: '',
    scorer: '',
    assistantScorer: '',
    timer: '',
    shotClockOperator: '',
});

// ゲーム
export interface Game {
    id: string;
    teamA: Team;
    teamB: Team;
    currentQuarter: number;  // 1-4 (Q1-Q4), 5+ (OT)
    phase: GamePhase;
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
    pendingActions: PendingAction[];  // 保留中のアクション
    selectedPlayerId: string | null;  // 現在選択中の選手
    selectedTeamId: string | null;    // 現在選択中のチーム
    startTime: Date | null;
    endTime: Date | null;
    gameInfo: GameInfo;  // 試合情報
    showThreePoint: boolean;  // 3P入力ボタンを表示するか（試合ごと・デフォルトfalse）
    quarterMinutes: 5 | 6;    // クォーター時間（分）。試合ごと・デフォルト6。OTは常に3分
}

// アクション種別
export type GameActionType =
    | 'SET_TEAMS'
    | 'START_GAME'
    | 'PAUSE_GAME'
    | 'RESUME_GAME'
    | 'END_QUARTER'
    | 'UNDO_QUARTER_END'
    | 'END_GAME'
    | 'ADD_SCORE'
    | 'ADD_STAT'
    | 'ADD_FOUL'
    | 'ADD_FOUL_WITH_FREE_THROWS'
    | 'EDIT_FOUL'
    | 'ADD_TIMEOUT'
    | 'REMOVE_TIMEOUT'
    | 'SUBSTITUTE_PLAYER'
    | 'ADD_PLAYER_TO_TEAM'
    | 'SELECT_PLAYER'
    | 'CLEAR_SELECTION'
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
    | 'REMOVE_PENDING_ACTION'
    | 'UPDATE_GAME_INFO'
    | 'TOGGLE_OWN_GOAL'
    | 'SET_END_TIME'
    | 'SET_SHOW_THREE_POINT'
    | 'SET_QUARTER_MINUTES';

// スタッツ種別（ADD_STAT / EDIT_STAT のペイロード用）
export type StatType =
    | 'OREB' | 'DREB' | 'AST' | 'STL' | 'BLK'
    | 'TO' | 'TO:DD' | 'TO:TR' | 'TO:PM' | 'TO:CM'
    | '2PA' | '3PA' | 'FTA';

// 得点種別
export type ScoreType = '2P' | '3P' | 'FT';

// ベンチテクニカルの種類
export type BenchTechType = 'HC' | 'AC' | 'Sub' | 'Bench';

/** ファウル＋フリースローの共通ペイロード */
interface FoulWithFreeThrowsBase {
    foulType: FoulType;
    shotSituation: ShotSituation;
    shotMade?: boolean;
    freeThrows: number;
    freeThrowResults: FreeThrowResult[];
    shooterTeamId: string;
    shooterPlayerId: string;
}

/**
 * ゲームアクション（判別可能ユニオン）。
 *
 * 以前は `{ type: GameActionType; payload?: unknown }` で、37アクションすべての
 * ペイロードが無検査だった。reducer側は29箇所で `payload as {...}` にキャストし、
 * dispatch側は何を渡しても通る。
 *
 * 実害が出ていた: App.tsx の handleLineupStart が quartersPlayed に `true` を
 * 書いていたが、型は 'starter' | 'sub' | 'both' | false でコンパイラは素通しした
 * （直後の START_GAME が上書きするため表面化していなかっただけ）。
 *
 * ここを union にすると、dispatch のペイロードが型で守られ、reducer側の
 * キャストも要らなくなる。
 */
export type GameAction =
    // フェーズ
    | { type: 'SET_TEAMS'; payload: { teamA: Team; teamB: Team; showThreePoint?: boolean; quarterMinutes?: 5 | 6 } }
    | { type: 'START_GAME' }
    | { type: 'PAUSE_GAME' }
    | { type: 'RESUME_GAME' }
    | { type: 'END_QUARTER' }
    | { type: 'UNDO_QUARTER_END' }
    | { type: 'END_GAME' }
    | { type: 'RESET_GAME' }
    | { type: 'SET_END_TIME'; payload: { endTime: Date | null } }
    // 得点
    | { type: 'ADD_SCORE'; payload: { teamId: string; playerId: string; scoreType: ScoreType; entryId?: string } }
    | { type: 'REMOVE_SCORE'; payload: { entryId: string } }
    | { type: 'EDIT_SCORE'; payload: { entryId: string; newPlayerId: string; newScoreType: ScoreType } }
    // newPlayerId は「誰の記録か」も同時に直すとき用（省略時は元の選手のまま）。
    // 記録中は「押し間違えた選手」と「成功／ミスの取り違え」が同時に起きるため、
    // 変換と付け替えを別の操作に分けると、片方が黙って捨てられる経路ができる
    | { type: 'CONVERT_SCORE_TO_MISS'; payload: { entryId: string; newMissType: '2PA' | '3PA' | 'FTA'; newPlayerId?: string } }
    | { type: 'CONVERT_MISS_TO_SCORE'; payload: { entryId: string; newScoreType: ScoreType; newPlayerId?: string } }
    | { type: 'TOGGLE_OWN_GOAL'; payload: { entryId: string } }
    // スタッツ
    | { type: 'ADD_STAT'; payload: { teamId: string; playerId: string; statType: StatType; entryId?: string } }
    | { type: 'REMOVE_STAT'; payload: { entryId: string } }
    | { type: 'EDIT_STAT'; payload: { entryId: string; newPlayerId: string; newStatType: StatType } }
    // ファウル
    | { type: 'ADD_FOUL'; payload: { teamId: string; playerId: string | null; foulType: FoulType } }
    | {
        type: 'ADD_FOUL_WITH_FREE_THROWS';
        payload: FoulWithFreeThrowsBase & { teamId: string; playerId: string | null; benchTechType?: BenchTechType };
    }
    // ファウルをした選手の付け替え。種別とFTは動かさない（理由は handleEditFoul）
    | { type: 'EDIT_FOUL'; payload: { entryId: string; newPlayerId: string } }
    | { type: 'REMOVE_FOUL'; payload: { entryId: string } }
    // 管理
    | { type: 'SUBSTITUTE_PLAYER'; payload: { teamId: string; playerInId: string; playerOutId: string } }
    | { type: 'ADD_TIMEOUT'; payload: { teamId: string; elapsedMinutes: number } }
    // 記録したタイムアウトの取り消し。得点・スタッツ・ファウルと違って
    // アクション履歴に載らないため、これが無いと誤記録を直す手段が無い
    | { type: 'REMOVE_TIMEOUT'; payload: { teamId: string; quarter: number } }
    | { type: 'ADD_PLAYER_TO_TEAM'; payload: { teamId: string; number: number; name: string } }
    | { type: 'SELECT_PLAYER'; payload: { playerId: Game['selectedPlayerId']; teamId: Game['selectedTeamId'] } }
    | { type: 'CLEAR_SELECTION' }
    // 未解決アクション
    | { type: 'ADD_PENDING_ACTION'; payload: PendingAction }
    | { type: 'RESOLVE_PENDING_ACTION'; payload: { pendingActionId: string; playerId: string } }
    | { type: 'RESOLVE_PENDING_ACTION_WITH_FOUL_TYPE'; payload: { pendingActionId: string; playerId: string; foulType: FoulType } }
    | {
        type: 'RESOLVE_PENDING_ACTION_WITH_FREE_THROWS';
        payload: FoulWithFreeThrowsBase & { pendingActionId: string; playerId: string };
    }
    | { type: 'RESOLVE_PENDING_ACTION_UNKNOWN'; payload: { pendingActionId: string } }
    | { type: 'UPDATE_PENDING_ACTION_CANDIDATES'; payload: { pendingActionId: string; candidatePlayerIds: string[] } }
    | { type: 'REMOVE_PENDING_ACTION'; payload: { pendingActionId: string } }
    // 設定・復元
    | { type: 'RESTORE_GAME'; payload: { game: Game } }
    | { type: 'UPDATE_GAME_INFO'; payload: Partial<GameInfo> }
    | { type: 'SET_SHOW_THREE_POINT'; payload: { showThreePoint: boolean } }
    | { type: 'SET_QUARTER_MINUTES'; payload: { quarterMinutes: 5 | 6 } };

/** GameAction から特定のtypeのペイロード型を取り出す（ハンドラの引数用） */
export type PayloadOf<T extends GameAction['type']> =
    Extract<GameAction, { type: T }> extends { payload: infer P } ? P : never;

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
export const createPlayer = (id: string, number: number, name: string, isCaptain = false, courtName?: string, licenseNo?: string): Player => ({
    id,
    number,
    name,
    courtName,
    licenseNo,
    isCaptain,
    fouls: [],
    stats: createInitialStats(),
    quartersPlayed: [false, false, false, false],
    isOnCourt: false,
});

// 初期チーム作成
export const createTeam = (id: string, name: string, coachName: string, assistantCoachName = '', coachLicenseNo?: string, assistantCoachLicenseNo?: string): Team => ({
    id,
    name,
    coachName,
    coachLicenseNo,
    assistantCoachName,
    assistantCoachLicenseNo,
    players: [],
    timeouts: [],
    teamFouls: [0, 0, 0, 0],
    coachFouls: [],
    assistantCoachFouls: [],
    benchFouls: [],
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
    gameInfo: createInitialGameInfo(),
    showThreePoint: false,
    quarterMinutes: DEFAULT_QUARTER_MINUTES,
});

// ミニバスルール定数
export const MAX_QUARTERS = 4;
export const MAX_PERSONAL_FOULS = 5;
export const DEFAULT_QUARTER_MINUTES = 6; // クォーター時間の既定値（分）
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
    shotSituation: ShotSituation,
    shotMade: boolean = false
): number => {
    // T（テクニカル）は1本
    if (foulType === 'T' || foulType === 'BT') return 1;

    // U/D は2本
    if (['U', 'D'].includes(foulType)) return 2;

    // シュート中のファウル（バスケットカウント対応）
    if (shotSituation === '3P') return shotMade ? 1 : 3;
    if (shotSituation === '2P') return shotMade ? 1 : 2;

    // チームファウル5個目以降（ペナルティ状態）は2本
    if (teamFouls >= TEAM_FOUL_LIMIT) return 2;

    // それ以外は0本
    return 0;
};
