import type { Team, ScoreEntry, StatEntry, FoulEntry, GameInfo } from '../types/game';
import type { PendingAction } from '../types/pendingAction';
import { createJsonStorage } from './createStorage';
import { repairGameRecords } from './repairGameRecords';

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
    // 試合ごとの設定。記録そのものではないが、あとから記録を読むときの前提になる
    // （5分制の試合か6分制か、3P入力を使った試合か）。保存していなかったため、
    // 履歴から開いた時点でどちらだったのか分からなくなっていた。
    // 旧レコードには無いので、読む側は未設定を許容すること。
    showThreePoint?: boolean;
    quarterMinutes?: 5 | 6;
    // 公式様式の「試合終了時間」（ISO文字列）。
    // createdAt（保存ボタンを押した時刻）とは別物で、記録者が GameInfoModal で
    // 入れた値、または END_GAME を押した時刻が入る。ここが無かったため、
    // 試合中に出したPDFと履歴から出したPDFで終了時間が食い違っていた。
    // 旧レコードには無いので、読む側は未設定を許容すること。
    endTime?: string;
    createdAt: string;
}

/** チームの選手スタッツから合計得点を出す（saveGameResult と同じ数え方） */
function sumTeamPoints(team: GameRecord['teamA'] | undefined): number {
    if (!team || !Array.isArray(team.players)) return 0;
    return team.players.reduce((sum, p) => sum + (p?.stats?.points ?? 0), 0);
}

/**
 * 試合レコードの最終スコアを読む（欠けていれば選手スタッツから組み直す）。
 *
 * finalScore は saveGameResult が必ず書くので、記録エンジンを通ったレコードには
 * 必ずある。欠けるのは手で編集した／途中で切れたバックアップを取り込んだ場合で、
 * 読み手はどこも素で `record.finalScore.teamA` と引いていた。実測: finalScore を
 * 落とした1件を取り込むと、選手スタッツ分析と履歴の一覧が
 * 「Cannot read properties of undefined (reading 'teamA')」で落ち、ErrorBoundary に
 * よってアプリ全体がエラー画面に置き換わる。localStorage に残るのでリロードしても
 * 再発し、どのレコードが原因かも示されない。
 *
 * migrateTeam が選手ごとの stats に対してしたのと同じ扱いをレコード単位で行う。
 * 0 で埋めずに選手スタッツから足すのは、saveGameResult がそもそもその合計を
 * 書いているため。組み直せば勝敗も試合数も実態どおりに戻る。
 */
export function resolveFinalScore(record: GameRecord): { teamA: number; teamB: number } {
    const stored = record?.finalScore;
    if (stored && typeof stored.teamA === 'number' && typeof stored.teamB === 'number') {
        return stored;
    }
    return { teamA: sumTeamPoints(record?.teamA), teamB: sumTeamPoints(record?.teamB) };
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
    pendingActions: PendingAction[] = [],
    extra?: { showThreePoint?: boolean; quarterMinutes?: 5 | 6; endTime?: Date | null }
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
        ...(extra?.showThreePoint !== undefined ? { showThreePoint: extra.showThreePoint } : {}),
        ...(extra?.quarterMinutes !== undefined ? { quarterMinutes: extra.quarterMinutes } : {}),
        ...(extra?.endTime ? { endTime: new Date(extra.endTime).toISOString() } : {}),
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

/**
 * 試合履歴をまるごと差し替える（インポート用）。保存できたら true。
 *
 * インポートは localStorage.setItem を直接呼んでいたため、容量超過の検知と
 * 保存失敗の通知（createStorage）を素通りしていた。成否を返すのは、
 * 呼び出し側が「保存できたか」で分岐できないと成功と偽って報告できてしまうため。
 */
export function saveGameHistory(records: GameRecord[]): boolean {
    return historyStorage.save(records);
}

// 試合履歴一覧取得
// 旧バージョン由来の重複IDと、壊れたレコード（手で編集した／途中で切れた
// バックアップの取り込み）はこの時点で修復する。読み手は全部ここを通るので、
// 直す場所を1つにできる（utils/repairGameRecords）
export function loadGameHistory(): GameRecord[] {
    const history = historyStorage.load();
    if (!Array.isArray(history)) return [];

    const repaired = repairGameRecords(history) ?? history;
    const deduped = dedupeGameIds(repaired);
    const result = deduped ?? repaired;

    if (result !== history) historyStorage.save(result);
    return result;
}

// 試合詳細取得
export function loadGameRecord(infoId: string): GameRecord | null {
    const history = loadGameHistory();
    return history.find(r => r.id === infoId) || null;
}

/**
 * 試合記録のgameInfoを更新する（書けたら true）。
 *
 * 成否を返すのは saveGameResult と同じ理由。戻り値を捨てていたため、容量が
 * 尽きた端末では localStorage に書けていないのに、呼び出し側（History）が
 * メモリ上の複製だけ更新して「入力が反映された画面」を出していた。
 * 再読み込みするとその入力は消える。
 */
export function updateGameRecordGameInfo(id: string, gameInfo: GameInfo): boolean {
    const history = loadGameHistory();
    const index = history.findIndex(r => r.id === id);
    if (index === -1) return false;

    history[index].gameInfo = gameInfo;
    return recordStorage.save(history);
}

/**
 * 試合記録の終了時間を更新する。
 *
 * gameInfo とは別フィールドなので updateGameRecordGameInfo では書けない。
 * これが無いと、履歴から開いたスコアシートの終了時間欄は入力も保存も
 * できるのに値がどこにも行かない（無言で捨てられる）。
 *
 * 書けたら true（成否を返す理由は updateGameRecordGameInfo と同じ）。
 */
export function updateGameRecordEndTime(id: string, endTime: Date | null): boolean {
    const history = loadGameHistory();
    const index = history.findIndex(r => r.id === id);
    if (index === -1) return false;

    if (endTime) {
        history[index] = { ...history[index], endTime: new Date(endTime).toISOString() };
    } else {
        // 未設定に戻すときはキーごと消す（旧レコードと同じ形に揃える）
        const cleared = { ...history[index] };
        delete cleared.endTime;
        history[index] = cleared;
    }
    return recordStorage.save(history);
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

/**
 * 指定した savedTeamId の紐付けを過去試合から外す（外した件数を返す）。
 *
 * マイチームを削除すると、その id は二度と一致しない。isMyTeamSide は
 * savedTeamId があれば名前へフォールバックしないため（改名時の取り違え防止）、
 * 記録は履歴に残るのに選手スタッツ分析からだけ消える。実測で
 * getMyTeamGames が 1件 → 0件 になった。
 *
 * 削除の時点で紐付けを外し、savedTeamId を持たない旧データと同じ
 * 名前照合の経路へ戻す。同名でチームを作り直せば、起動時の
 * backfillSavedTeamIds が再び id を結び直す。
 *
 * 該当が無ければ書き込まない（保存のたびに履歴全体を書き戻さない）。
 */
export function unlinkSavedTeamId(teamId: string): number {
    if (!teamId) return 0;
    const history = loadGameHistory();
    let unlinked = 0;

    const strip = (team: Team): Team => {
        if (team?.savedTeamId !== teamId) return team;
        unlinked++;
        const next = { ...team };
        delete next.savedTeamId;
        return next;
    };

    const next = history.map(record => ({
        ...record,
        teamA: strip(record.teamA),
        teamB: strip(record.teamB),
    }));

    if (unlinked === 0) return 0;
    historyStorage.save(next);
    return unlinked;
}
