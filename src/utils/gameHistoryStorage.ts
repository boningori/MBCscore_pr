import type { Team, ScoreEntry, StatEntry, FoulEntry, GameInfo } from '../types/game';
import type { PendingAction } from '../types/pendingAction';
import { createJsonStorage } from './createStorage';

const GAME_HISTORY_KEY = 'minibasket-game-history';

// 配列以外が入っていたら捨てる（詳細は teamStorage の同名コメント参照）
const isRecordArray = (v: unknown): v is GameRecord[] => Array.isArray(v);

const historyStorage = createJsonStorage<GameRecord[]>(GAME_HISTORY_KEY, [], 'game result', isRecordArray);
const recordStorage = createJsonStorage<GameRecord[]>(GAME_HISTORY_KEY, [], 'game record', isRecordArray);

export interface GameRecord {
    id: string;
    date: string; // ISO string
    gameName: string; // 大会名や試合名
    location?: string; // 場所（任意）
    teamA: Team;
    teamB: Team;
    finalScore: {
        teamA: number;
        teamB: number;
    };
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
    gameInfo?: GameInfo; // 試合情報（審判員・会場など）
    // 選手を割り当てないまま試合を終えた記録。
    // 保留中の得点はどの選手のスタッツにも入っていないため finalScore には
    // 現れないが、「何が未割り当てだったか」を残さないと後から追えない。
    // 未解決のまま終わることは稀なので任意フィールドにしている。
    pendingActions?: PendingAction[];
    createdAt: string;
}

// 試合IDのランダムサフィックス（同一ミリ秒での衝突を防ぐ）
function randomSuffix(): string {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
}

/**
 * 試合IDを生成する。
 *
 * 試合日は <input type="date"> 由来の YYYY-MM-DD（＝常に 00:00:00）なので、
 * 日付の getTime() だけではその日の全試合が同一IDになる。ランダムサフィックスを
 * 付けて必ず一意にする。IDが重複すると、バックアップ復元時のID名寄せで試合が
 * 統合されて消える・1件削除で同日の全試合が消える等のデータ欠損につながる。
 */
export function createGameId(date: Date): string {
    return `game-${date.getTime()}-${randomSuffix()}`;
}

/** 試合結果の保存結果。saved が false なら履歴に残っていない */
export interface SaveGameResult {
    record: GameRecord;
    saved: boolean;
}

/**
 * 試合結果を履歴に保存する。
 *
 * 保存の成否を返す。呼び出し側はこれを見てから中断セッションを消すこと。
 * 以前は成否を返さず、容量超過などで保存に失敗しても呼び出し側が
 * セッションを無条件に消していたため、履歴にもセッションにも残らない
 * 試合が生まれる経路があった。
 */
export function saveGameResult(
    gameName: string,
    teamA: Team,
    teamB: Team,
    scoreHistory: ScoreEntry[],
    statHistory: StatEntry[],
    foulHistory: FoulEntry[],
    date: Date = new Date(),
    gameInfo?: GameInfo,
    pendingActions: PendingAction[] = []
): SaveGameResult {
    const record: GameRecord = {
        id: createGameId(date),
        date: date.toISOString(),
        gameName,
        teamA,
        teamB,
        finalScore: {
            teamA: teamA.players.reduce((sum, p) => sum + p.stats.points, 0),
            teamB: teamB.players.reduce((sum, p) => sum + p.stats.points, 0),
        },
        scoreHistory,
        statHistory,
        foulHistory,
        gameInfo,
        ...(pendingActions.length > 0 ? { pendingActions } : {}),
        createdAt: new Date().toISOString(),
    };

    const history = loadGameHistory();
    history.unshift(record); // 新しい順
    const saved = historyStorage.save(history);

    return { record, saved };
}

/**
 * 履歴内の重複IDを解消した配列を返す（変更が不要なら null）。
 *
 * 旧バージョンは試合IDを試合日だけから作っていたため、同じ日に記録した試合は
 * 全て同一IDになっている。IDで名寄せする処理（バックアップ復元・削除・更新）が
 * 試合を取り違えるので、読み込み時に後続の重複分へ新しいIDを振り直す。
 * 先頭の1件は既存IDを保持し、他データからの参照ずれを最小限にする。
 */
export function dedupeGameIds(records: GameRecord[]): GameRecord[] | null {
    const used = new Set<string>();
    let changed = false;

    const result = records.map(record => {
        if (typeof record?.id === 'string' && !used.has(record.id)) {
            used.add(record.id);
            return record;
        }
        let id = createGameId(record?.date ? new Date(record.date) : new Date());
        while (used.has(id)) {
            id = createGameId(record?.date ? new Date(record.date) : new Date());
        }
        used.add(id);
        changed = true;
        return { ...record, id };
    });

    return changed ? result : null;
}

/** 書き戻しに要るのは id と名前だけ。teamStorage への依存を持ち込まないため SavedTeam 型は取らない */
export interface MyTeamRef {
    id: string;
    name: string;
}

/**
 * savedTeamId を持たない旧レコードに、現在のチーム名からマイチームのidを書き戻す
 * （書き戻す対象が無ければ null）。
 *
 * savedTeamId を記録し始めるより前の試合は名前でしか結び付かないため、放っておくと
 * 「これから改名する人」の既存データが分析から消える。改名される前の今のうちに、
 * 名前による帰属をidへ凍結しておく。
 *
 * 誤った結び付けは名前の取り違えより厄介で、idは改名しても自己修正しない。そこで
 * 今日の帰属が一意に決まるときだけ書く:
 *   - 両側とも savedTeamId を持たないレコードだけを対象にする
 *   - isMyTeam が真の側がちょうど1つあること（＝どちらが自分かが記録に残っている）
 *   - その側の名前に一致する登録マイチームがちょうど1つであること
 * どれかを満たさなければ何も書かず、従来どおり名前照合に委ねる。
 *
 * この条件のもとでは、書き戻した瞬間の getMyTeamGames の結果は書き戻す前と一致する
 * （相手側にはidを付けないので、相手として登場する自分の別チームも名前で拾えたまま）。
 * 変わるのは、以後の改名に耐えるようになることだけ。
 *
 * すでに改名済みの利用者の過去の試合は救えない。旧チーム名がどこにも残っておらず、
 * 照合の手掛かりが無いため。
 */
export function backfillSavedTeamIds(records: GameRecord[], myTeams: MyTeamRef[]): GameRecord[] | null {
    let changed = false;

    const result = records.map(record => {
        if (record?.teamA?.savedTeamId || record?.teamB?.savedTeamId) return record;

        const aIsMine = record?.teamA?.isMyTeam === true;
        const bIsMine = record?.teamB?.isMyTeam === true;
        if (aIsMine === bIsMine) return record; // どちらでもない／両方＝自分側を決められない

        const team = aIsMine ? record.teamA : record.teamB;
        const matched = myTeams.filter(t => t.name === team.name);
        if (matched.length !== 1) return record;

        changed = true;
        const withId = { ...team, savedTeamId: matched[0].id };
        return aIsMine ? { ...record, teamA: withId } : { ...record, teamB: withId };
    });

    return changed ? result : null;
}

/**
 * 履歴に backfillSavedTeamIds を適用して保存する（書き戻した場合だけ true）。
 *
 * 呼び出しは起動時の1回だけ（savedTeamIdMigration）。loadGameHistory の中には
 * 置かない —— 履歴の読み込みは至る所から何度も走るので、そのたびにマイチーム一覧を
 * 読み直して全レコードを走査することになる。
 */
export function applySavedTeamIdBackfill(myTeams: MyTeamRef[]): boolean {
    const backfilled = backfillSavedTeamIds(loadGameHistory(), myTeams);
    if (!backfilled) return false;

    historyStorage.save(backfilled);
    return true;
}

// 試合履歴一覧取得（旧バージョン由来の重複IDはこの時点で修復する）
export function loadGameHistory(): GameRecord[] {
    const history = historyStorage.load();
    if (!Array.isArray(history)) return [];

    const deduped = dedupeGameIds(history);
    if (!deduped) return history;

    historyStorage.save(deduped);
    return deduped;
}

// 試合詳細取得
export function loadGameRecord(infoId: string): GameRecord | null {
    const history = loadGameHistory();
    return history.find(r => r.id === infoId) || null;
}

// 試合記録のgameInfoを更新
export function updateGameRecordGameInfo(id: string, gameInfo: GameInfo): void {
    const history = loadGameHistory();
    const index = history.findIndex(r => r.id === id);
    if (index !== -1) {
        history[index].gameInfo = gameInfo;
        recordStorage.save(history);
    }
}

// 履歴削除
export function deleteGameRecord(id: string): void {
    const history = loadGameHistory().filter(r => r.id !== id);
    historyStorage.save(history);
}

// 試合名の候補を取得（同日優先、最近の試合名も含む）
export function getGameNameSuggestions(targetDate?: string): string[] {
    const history = loadGameHistory();
    if (history.length === 0) return [];

    const suggestions: string[] = [];
    const seen = new Set<string>();

    // 同日の試合名を優先
    if (targetDate) {
        for (const record of history) {
            const recordDate = record.date.substring(0, 10); // YYYY-MM-DD
            if (recordDate === targetDate && !seen.has(record.gameName)) {
                suggestions.push(record.gameName);
                seen.add(record.gameName);
            }
        }
    }

    // 最近の試合名も追加（最大10件）
    for (const record of history) {
        if (!seen.has(record.gameName) && suggestions.length < 10) {
            suggestions.push(record.gameName);
            seen.add(record.gameName);
        }
    }

    return suggestions;
}
