// 選手スタッツ分析ユーティリティ - 個人成長追跡版

import type { PlayerStats } from '../types/game';
import type { GameRecord } from './gameHistoryStorage';
import { loadGameHistory } from './gameHistoryStorage';
import { loadMyTeams, type SavedTeam } from './teamStorage';
import { createJsonStorage } from './createStorage';
import { formatRecordDate, recordDateParts, recordInputDate } from './localDate';
import { isDisqualified } from './disqualification';

// 非表示選手ストレージ。
// 配列やnullが入っているとチームIDでの索引が壊れるため、素のオブジェクトのみ受ける
const hiddenStorage = createJsonStorage<Record<string, string[]>>(
    'minibasket-hidden-players', {}, 'hidden players',
    (v): v is Record<string, string[]> => typeof v === 'object' && v !== null && !Array.isArray(v),
);

// チームごとの非表示選手キーを保存
export function saveHiddenPlayers(teamId: string, playerKeys: string[]): void {
    const all = loadAllHiddenPlayers();
    all[teamId] = playerKeys;
    hiddenStorage.save(all);
}

// チームの非表示選手キーを取得
export function loadHiddenPlayers(teamId: string): string[] {
    const all = loadAllHiddenPlayers();
    return all[teamId] || [];
}

// 全チームの非表示選手を取得
function loadAllHiddenPlayers(): Record<string, string[]> {
    return hiddenStorage.load();
}

// 選手の非表示状態をトグル
export function togglePlayerHidden(teamId: string, playerKey: string): boolean {
    const hidden = loadHiddenPlayers(teamId);
    const index = hidden.indexOf(playerKey);
    if (index >= 0) {
        hidden.splice(index, 1);
        saveHiddenPlayers(teamId, hidden);
        return false; // 表示状態に変更
    } else {
        hidden.push(playerKey);
        saveHiddenPlayers(teamId, hidden);
        return true; // 非表示状態に変更
    }
}

// 選手が非表示かチェック
export function isPlayerHidden(teamId: string, playerKey: string): boolean {
    const hidden = loadHiddenPlayers(teamId);
    return hidden.includes(playerKey);
}

// 期間タイプ
export type PeriodType = 'game' | 'month' | 'quarter' | 'year';

// 集計後の選手スタッツ型
export interface AggregatedPlayerStats {
    playerKey: string;        // 識別用キー (名前_ライセンスNo)
    number: number;           // 最新の背番号
    name: string;
    licenseNo?: string;
    gamesPlayed: number;      // 出場試合数
    // 出場したクォーターの通算（OTも1つとして数える）。
    //
    // ミニバスは全員出場ルールがあり、1Qだけ出た試合と4Q出た試合が同居する。
    // 「試合平均」だけを見るとエースほど過小・控えほど過大に評価される。
    // 出場していない旧データ（quartersPlayed 未記録）は0のままにして推測しない。
    // 0のときは1Qあたりの数値を出してはいけない（ゼロ除算になる）。
    totalQuartersPlayed: number;
    // 「1クォーターあたり」を出すための、出場Qが記録されている試合だけの試合数と累計。
    //
    // totalStats / gamesPlayed は全試合が対象なので、これで totalQuartersPlayed を
    // 割ると分子と分母の対象試合が食い違う。出場Qを記録していない試合が1つでも
    // 混ざると、その試合の得点まで他の試合の出場Qで割られて必ず過大になる
    // （実測: 2Q出場10点＋Q未記録10点で 10.0点/Q。正しくは 5.0）。
    // 出場Q未記録は旧データに限らず、スタメンを確定しないまま記録した試合でも起きる。
    gamesWithQuarters: number;
    statsWithQuarters: PlayerStats;
    // ファウルの通算と、退場・失格に至った試合数。
    //
    // ファウルは PlayerStats に無い（Player.fouls に別で入っている）ため、
    // これまで分析側では一切集計されていなかった。試合中の画面には出るのに
    // 成長を追う画面にだけ無い、という非対称になっていた。
    totalFouls: number;
    foulOutGames: number;
    totalStats: PlayerStats;  // 累積スタッツ
    avgStats: PlayerStats;    // 平均スタッツ
    stdDevStats: PlayerStats; // 標準偏差
    // 試合ごとの OR+DR の標準偏差。
    //
    // stdDevStats.offensiveRebounds + stdDevStats.defensiveRebounds では求まらない。
    // 標準偏差は加算できないため（平均は加算できるので avgStats は足してよい）。
    // 足すと必ず過大評価になり、OR偏重・DR偏重が試合ごとに入れ替わる選手ほど
    // 外れる（実測: 毎試合REB4で安定している選手が ±4 と表示されていた）。
    reboundsStdDev: number;
    gameHistory: PlayerGameRecord[];  // 試合別履歴
}

// 試合別の選手記録
export interface PlayerGameRecord {
    gameId: string;
    date: string;
    opponent: string;
    stats: PlayerStats;
    result: 'win' | 'loss' | 'draw';
    teamScore: number;
    opponentScore: number;
    /** この試合で出場したクォーター数（OTも1つとして数える。旧データは0） */
    quartersPlayed: number;
    /** この試合のファウル数 */
    fouls: number;
    /** この試合で退場・失格したか（5ファウル / D / U・T 2回） */
    fouledOut: boolean;
}

// 期間別の集計結果
export interface PeriodStats {
    periodKey: string;        // "2026-01" (月), "2026-Q1" (四半期), "2026" (年)
    periodLabel: string;      // 表示用ラベル
    startDate: Date;
    endDate: Date;
    gamesPlayed: number;
    totalStats: PlayerStats;
    avgStats: PlayerStats;
    stdDevStats: PlayerStats;
}

// 選手キー生成（名前_ライセンスNo）
export function generatePlayerKey(name: string, licenseNo?: string): string {
    if (licenseNo && licenseNo.trim()) {
        return `${name}_${licenseNo.trim()}`;
    }
    return name;
}

/** 識別キーを決めるのに要る最小限の選手情報 */
interface KeyablePlayer {
    name: string;
    licenseNo?: string;
    number: number;
}

/**
 * このチームの試合を通して、一度でも同じ名簿の中で衝突した識別キーを集める。
 *
 * 判定は「1試合の名簿の中で重なったか」だが、結果は全試合に効かせる。
 * 試合ごとに判定すると、同姓の相方が欠席した試合だけキーが氏名だけに戻り、
 * 同一人物の履歴が2枚のカードに割れる（実測: 佐藤#4・佐藤#7 が居る試合と
 * #4 だけの試合の2試合で、「佐藤」「佐藤#4」「佐藤#7」の3人が並び、#4 の
 * 通算・平均・成長グラフがどちらのカードでも実態と違う値になっていた）。
 *
 * 期間で絞る前の全試合を渡すこと。絞り込みでキーが変わると、期間を変えた
 * だけで別人扱いになり、playerKey で保存している非表示設定もずれる。
 */
function collectCollidingKeys(rosters: KeyablePlayer[][]): Set<string> {
    const colliding = new Set<string>();
    for (const players of rosters) {
        const seen = new Set<string>();
        for (const p of players) {
            const key = generatePlayerKey(p.name, p.licenseNo);
            if (seen.has(key)) colliding.add(key);
            seen.add(key);
        }
    }
    return colliding;
}

/**
 * 1試合の名簿から、選手ごとの識別キーを決める（名簿と同じ並びで返す）。
 *
 * 基本は generatePlayerKey。ライセンスNo.は任意入力なので、未入力だとキーが
 * 氏名だけになり、同じ姓の2人が1人に合算されていた。1試合しか無いのに
 * gamesPlayed が2になり、実在しない「2試合◯点/試合」の選手カードが出て、
 * もう1人は一覧から消える（チームサマリーの試合数とも食い違う）。
 * カードに出るのは氏名で、ミニバスで同じ姓は珍しくない。
 *
 * 衝突した氏名だけ背番号を足して分ける。衝突しない選手のキーは変えない
 * —— 非表示選手の設定は playerKey で保存されているため、既存の設定を
 * 壊してはいけない。背番号で分けると、その2人はシーズンをまたぐ背番号変更で
 * 別人に割れるが、別人が1人に混ざるより直しやすい（ライセンスNo.を入れれば
 * 根本的に解決する）。
 *
 * @param colliding 全試合を通した衝突キー（collectCollidingKeys）
 */
function buildPlayerKeys(players: KeyablePlayer[], colliding: ReadonlySet<string>): string[] {
    return players.map(p => {
        const key = generatePlayerKey(p.name, p.licenseNo);
        return colliding.has(key) ? `${key}#${p.number}` : key;
    });
}

// 空のPlayerStatsを作成
function createEmptyStats(): PlayerStats {
    return {
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
    };
}

// 2つのPlayerStatsを加算
function addStats(a: PlayerStats, b: PlayerStats): PlayerStats {
    return {
        points: a.points + b.points,
        twoPointMade: a.twoPointMade + b.twoPointMade,
        twoPointAttempt: a.twoPointAttempt + b.twoPointAttempt,
        threePointMade: a.threePointMade + b.threePointMade,
        threePointAttempt: a.threePointAttempt + b.threePointAttempt,
        freeThrowMade: a.freeThrowMade + b.freeThrowMade,
        freeThrowAttempt: a.freeThrowAttempt + b.freeThrowAttempt,
        offensiveRebounds: a.offensiveRebounds + b.offensiveRebounds,
        defensiveRebounds: a.defensiveRebounds + b.defensiveRebounds,
        assists: a.assists + b.assists,
        steals: a.steals + b.steals,
        blocks: a.blocks + b.blocks,
        turnovers: a.turnovers + b.turnovers,
        turnoverDD: (a.turnoverDD || 0) + (b.turnoverDD || 0),
        turnoverTR: (a.turnoverTR || 0) + (b.turnoverTR || 0),
        turnoverPM: (a.turnoverPM || 0) + (b.turnoverPM || 0),
        turnoverCM: (a.turnoverCM || 0) + (b.turnoverCM || 0),
    };
}

// PlayerStatsを除算
function divideStats(stats: PlayerStats, divisor: number): PlayerStats {
    if (divisor === 0) return createEmptyStats();
    return {
        points: stats.points / divisor,
        twoPointMade: stats.twoPointMade / divisor,
        twoPointAttempt: stats.twoPointAttempt / divisor,
        threePointMade: stats.threePointMade / divisor,
        threePointAttempt: stats.threePointAttempt / divisor,
        freeThrowMade: stats.freeThrowMade / divisor,
        freeThrowAttempt: stats.freeThrowAttempt / divisor,
        offensiveRebounds: stats.offensiveRebounds / divisor,
        defensiveRebounds: stats.defensiveRebounds / divisor,
        assists: stats.assists / divisor,
        steals: stats.steals / divisor,
        blocks: stats.blocks / divisor,
        turnovers: stats.turnovers / divisor,
        turnoverDD: (stats.turnoverDD || 0) / divisor,
        turnoverTR: (stats.turnoverTR || 0) / divisor,
        turnoverPM: (stats.turnoverPM || 0) / divisor,
        turnoverCM: (stats.turnoverCM || 0) / divisor,
    };
}

// 標準偏差を計算
function calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
}

// 試合履歴から選手スタッツの標準偏差を計算
function calculateStatsStdDev(gameHistory: PlayerGameRecord[], avgStats: PlayerStats): PlayerStats {
    if (gameHistory.length < 2) return createEmptyStats();

    return {
        points: calculateStdDev(gameHistory.map(g => g.stats.points), avgStats.points),
        twoPointMade: calculateStdDev(gameHistory.map(g => g.stats.twoPointMade), avgStats.twoPointMade),
        twoPointAttempt: calculateStdDev(gameHistory.map(g => g.stats.twoPointAttempt), avgStats.twoPointAttempt),
        threePointMade: calculateStdDev(gameHistory.map(g => g.stats.threePointMade), avgStats.threePointMade),
        threePointAttempt: calculateStdDev(gameHistory.map(g => g.stats.threePointAttempt), avgStats.threePointAttempt),
        freeThrowMade: calculateStdDev(gameHistory.map(g => g.stats.freeThrowMade), avgStats.freeThrowMade),
        freeThrowAttempt: calculateStdDev(gameHistory.map(g => g.stats.freeThrowAttempt), avgStats.freeThrowAttempt),
        offensiveRebounds: calculateStdDev(gameHistory.map(g => g.stats.offensiveRebounds), avgStats.offensiveRebounds),
        defensiveRebounds: calculateStdDev(gameHistory.map(g => g.stats.defensiveRebounds), avgStats.defensiveRebounds),
        assists: calculateStdDev(gameHistory.map(g => g.stats.assists), avgStats.assists),
        steals: calculateStdDev(gameHistory.map(g => g.stats.steals), avgStats.steals),
        blocks: calculateStdDev(gameHistory.map(g => g.stats.blocks), avgStats.blocks),
        turnovers: calculateStdDev(gameHistory.map(g => g.stats.turnovers), avgStats.turnovers),
        turnoverDD: calculateStdDev(gameHistory.map(g => g.stats.turnoverDD || 0), avgStats.turnoverDD || 0),
        turnoverTR: calculateStdDev(gameHistory.map(g => g.stats.turnoverTR || 0), avgStats.turnoverTR || 0),
        turnoverPM: calculateStdDev(gameHistory.map(g => g.stats.turnoverPM || 0), avgStats.turnoverPM || 0),
        turnoverCM: calculateStdDev(gameHistory.map(g => g.stats.turnoverCM || 0), avgStats.turnoverCM || 0),
    };
}

/** 試合ごとの OR+DR の標準偏差（詳細は AggregatedPlayerStats.reboundsStdDev のコメント） */
function calculateReboundsStdDev(gameHistory: PlayerGameRecord[], avgStats: PlayerStats): number {
    if (gameHistory.length < 2) return 0;
    return calculateStdDev(
        gameHistory.map(g => g.stats.offensiveRebounds + g.stats.defensiveRebounds),
        avgStats.offensiveRebounds + avgStats.defensiveRebounds,
    );
}

/**
 * 記録された1チームが、指定したマイチームかどうかを判定する。
 *
 * savedTeamId があれば id だけで決める。名前へフォールバックしないのは、
 * 旧名を別のマイチームが引き継いだときに取り違えないため。
 *
 * savedTeamId が無いのは、これを記録するより前に保存された試合か、相手側
 * （相手には入れない。理由は Team.savedTeamId のコメント）。この場合は
 * 従来どおり現在の名前で照合する。旧データは名前しか手掛かりが無い。
 */
function isMyTeamSide(team: GameRecord['teamA'], myTeam: SavedTeam): boolean {
    if (team.savedTeamId) return team.savedTeamId === myTeam.id;
    return team.name === myTeam.name;
}

/**
 * 試合履歴から、指定したマイチームの試合を抽出する。
 *
 * 以前は名前が一致しなくても isMyTeam だけで拾っていた。マイチームが1つなら
 * 実害は無いが、学年別・男女別に複数登録している環境では別チームの試合まで
 * 混ざり、試合数も平均も成長グラフも狂っていた（実測: 2チーム登録で
 * 一方の分析に他方の選手が並ぶ）。isMyTeam は「どちら側がマイチームか」しか
 * 示さないので、これだけで拾ってはいけない。
 *
 * 一方、名前だけを見ると改名した利用者の過去の試合が丸ごと抜ける。記録には
 * 旧チーム名しか残っていないため。そこで savedTeamId を優先し、持たない
 * 旧データだけ名前へ落とす（isMyTeamSide）。
 *
 * 紅白戦のように両側とも自分だと判定されたときだけ、どちらが自分側かを
 * isMyTeam で決める。
 */
export function getMyTeamGames(myTeam: SavedTeam): { record: GameRecord; isTeamA: boolean }[] {
    const history = loadGameHistory();
    const result: { record: GameRecord; isTeamA: boolean }[] = [];

    for (const record of history) {
        const isTeamAMine = isMyTeamSide(record.teamA, myTeam);
        const isTeamBMine = isMyTeamSide(record.teamB, myTeam);

        if (isTeamAMine && isTeamBMine) {
            result.push({ record, isTeamA: !record.teamB.isMyTeam });
        } else if (isTeamAMine) {
            result.push({ record, isTeamA: true });
        } else if (isTeamBMine) {
            result.push({ record, isTeamA: false });
        }
    }

    return result;
}

// 選手別スタッツを集計
export function aggregatePlayerStats(
    myTeam: SavedTeam,
    startDate?: Date,
    endDate?: Date,
    options?: { includeHidden?: boolean }
): AggregatedPlayerStats[] {
    const games = getMyTeamGames(myTeam);
    const playerMap = new Map<string, AggregatedPlayerStats>();
    // 選手ごとに「いま採用している背番号の試合日」。走査順は日付順とは限らない
    const latestNumberTime = new Map<string, number>();
    const hiddenPlayers = options?.includeHidden ? [] : loadHiddenPlayers(myTeam.id);
    // 同姓の判定は期間で絞る前の全試合で行う。理由は collectCollidingKeys
    const collidingKeys = collectCollidingKeys(
        games.map(({ record, isTeamA }) => (isTeamA ? record.teamA : record.teamB).players),
    );

    for (const { record, isTeamA } of games) {
        const gameDate = new Date(record.date);
        if (startDate && gameDate < startDate) continue;
        if (endDate && gameDate > endDate) continue;

        const myTeamData = isTeamA ? record.teamA : record.teamB;
        const opponentData = isTeamA ? record.teamB : record.teamA;
        const myScore = record.finalScore[isTeamA ? 'teamA' : 'teamB'];
        const opponentScore = record.finalScore[isTeamA ? 'teamB' : 'teamA'];

        const result: 'win' | 'loss' | 'draw' =
            myScore > opponentScore ? 'win' :
                myScore < opponentScore ? 'loss' : 'draw';

        // 氏名 + ライセンスNo. で識別。衝突したら背番号で分ける（buildPlayerKeys）
        const playerKeys = buildPlayerKeys(myTeamData.players, collidingKeys);

        for (const [playerIndex, player] of myTeamData.players.entries()) {
            const key = playerKeys[playerIndex];

            // 非表示選手をスキップ
            if (hiddenPlayers.includes(key)) continue;

            const hasStats = player.stats.points > 0 ||
                player.stats.twoPointAttempt > 0 ||
                player.stats.threePointAttempt > 0 ||
                player.stats.freeThrowAttempt > 0 ||
                player.stats.offensiveRebounds > 0 ||
                player.stats.defensiveRebounds > 0 ||
                player.stats.assists > 0 ||
                player.stats.steals > 0 ||
                player.stats.blocks > 0 ||
                player.stats.turnovers > 0;
            // 'starter' | 'sub' | 'both'（と旧boolean形式の true）が出場。false / 未記録は非出場
            const quartersPlayed = player.quartersPlayed?.filter(q => q !== false && !!q).length ?? 0;
            const hasPlayedQuarters = quartersPlayed > 0;
            // ファウルも「出場した証拠」。ここを見ていなかったため、スタメンを
            // 確定しないまま記録した試合でファウルしかしていない選手が丸ごと
            // 落ちていた（詳細画面はファウル数と退場試合数を出すのに、その
            // 選手だけ一覧にも集計にも現れない）
            const hasFouls = (player.fouls?.length ?? 0) > 0;

            if (!hasStats && !hasPlayedQuarters && !hasFouls) continue;

            const gameRecord: PlayerGameRecord = {
                gameId: record.id,
                date: record.date,
                opponent: opponentData.name,
                stats: { ...player.stats },
                result,
                teamScore: myScore,
                opponentScore: opponentScore,
                quartersPlayed,
                fouls: player.fouls?.length ?? 0,
                fouledOut: isDisqualified(player.fouls ?? []),
            };

            if (!playerMap.has(key)) {
                playerMap.set(key, {
                    playerKey: key,
                    number: player.number,
                    name: player.name,
                    licenseNo: player.licenseNo,
                    gamesPlayed: 0,
                    totalQuartersPlayed: 0,
                    gamesWithQuarters: 0,
                    statsWithQuarters: createEmptyStats(),
                    totalFouls: 0,
                    foulOutGames: 0,
                    totalStats: createEmptyStats(),
                    avgStats: createEmptyStats(),
                    stdDevStats: createEmptyStats(),
                    reboundsStdDev: 0,
                    gameHistory: [],
                });
            }

            const aggregated = playerMap.get(key)!;
            aggregated.gamesPlayed += 1;
            aggregated.totalQuartersPlayed += quartersPlayed;
            if (hasPlayedQuarters) {
                aggregated.gamesWithQuarters += 1;
                aggregated.statsWithQuarters = addStats(aggregated.statsWithQuarters, player.stats);
            }
            aggregated.totalFouls += gameRecord.fouls;
            if (gameRecord.fouledOut) aggregated.foulOutGames += 1;
            aggregated.totalStats = addStats(aggregated.totalStats, player.stats);
            aggregated.gameHistory.push(gameRecord);

            // 背番号はいちばん新しい試合のものを使う。
            //
            // 以前は push 済みの gameHistory[0]（＝最初に走査した試合）を基準にして
            // 「基準より新しければ上書き」としていた。基準より新しい試合が複数あると
            // 最大日付ではなく最後に走査したものが勝つ。履歴は保存順に並ぶので、
            // 過去の試合を後から入力すると日付順と食い違い、古い背番号が残っていた。
            const gameTime = new Date(record.date).getTime();
            const latest = latestNumberTime.get(key);
            if (latest === undefined || gameTime > latest) {
                latestNumberTime.set(key, gameTime);
                aggregated.number = player.number;
            }
        }
    }

    // 平均と標準偏差を計算
    for (const aggregated of playerMap.values()) {
        aggregated.avgStats = divideStats(aggregated.totalStats, aggregated.gamesPlayed);
        aggregated.stdDevStats = calculateStatsStdDev(aggregated.gameHistory, aggregated.avgStats);
        aggregated.reboundsStdDev = calculateReboundsStdDev(aggregated.gameHistory, aggregated.avgStats);
        aggregated.gameHistory.sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }

    return Array.from(playerMap.values()).sort((a, b) => a.number - b.number);
}

// 期間キーを生成。
// 記録された暦日で束ねる（現地時刻に直すと、UTCより西では月初の試合が前月に入る）
function getPeriodKey(iso: string, periodType: PeriodType): string {
    const parts = recordDateParts(iso);
    if (!parts) return iso;
    const { year, month } = parts;

    switch (periodType) {
        case 'month':
            return `${year}-${month.toString().padStart(2, '0')}`;
        case 'quarter': {
            const quarter = Math.ceil(month / 3);
            return `${year}-Q${quarter}`;
        }
        case 'year':
            return `${year}`;
        default:
            return recordInputDate(iso);
    }
}

// 期間ラベルを生成
function getPeriodLabel(periodKey: string, periodType: PeriodType): string {
    switch (periodType) {
        case 'month': {
            const [year, month] = periodKey.split('-');
            return `${year}年${parseInt(month)}月`;
        }
        case 'quarter': {
            const [y, q] = periodKey.split('-');
            return `${y}年${q}`;
        }
        case 'year':
            return `${periodKey}年`;
        default:
            return periodKey;
    }
}

// 選手の期間別スタッツを集計
export function aggregateByPeriod(
    gameHistory: PlayerGameRecord[],
    periodType: PeriodType
): PeriodStats[] {
    if (periodType === 'game') {
        // 試合単位はそのまま返す
        return gameHistory.map(game => ({
            periodKey: game.gameId,
            periodLabel: formatDate(game.date),
            startDate: new Date(game.date),
            endDate: new Date(game.date),
            gamesPlayed: 1,
            totalStats: { ...game.stats },
            avgStats: { ...game.stats },
            stdDevStats: createEmptyStats(),
        }));
    }

    const periodMap = new Map<string, { games: PlayerGameRecord[]; startDate: Date; endDate: Date }>();

    for (const game of gameHistory) {
        const date = new Date(game.date);
        const key = getPeriodKey(game.date, periodType);

        if (!periodMap.has(key)) {
            periodMap.set(key, { games: [], startDate: date, endDate: date });
        }
        const period = periodMap.get(key)!;
        period.games.push(game);
        if (date < period.startDate) period.startDate = date;
        if (date > period.endDate) period.endDate = date;
    }

    const result: PeriodStats[] = [];

    for (const [key, { games, startDate, endDate }] of periodMap) {
        const totalStats = games.reduce((acc, g) => addStats(acc, g.stats), createEmptyStats());
        const avgStats = divideStats(totalStats, games.length);
        const stdDevStats = calculateStatsStdDev(games, avgStats);

        result.push({
            periodKey: key,
            periodLabel: getPeriodLabel(key, periodType),
            startDate,
            endDate,
            gamesPlayed: games.length,
            totalStats,
            avgStats,
            stdDevStats,
        });
    }

    // 期間順にソート（新しい順）
    return result.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}

// 日付フォーマット（記録された暦日をそのまま出す。理由は localDate.ts）
const formatDate = formatRecordDate;

// 登録済みマイチーム一覧を取得
export function getAvailableMyTeams(): SavedTeam[] {
    return loadMyTeams();
}

// チームの戦績サマリー
export interface TeamRecord {
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
}

export function getTeamRecord(myTeam: SavedTeam, startDate?: Date, endDate?: Date): TeamRecord {
    const games = getMyTeamGames(myTeam);
    let wins = 0, losses = 0, draws = 0;

    for (const { record, isTeamA } of games) {
        const gameDate = new Date(record.date);
        if (startDate && gameDate < startDate) continue;
        if (endDate && gameDate > endDate) continue;

        const myScore = record.finalScore[isTeamA ? 'teamA' : 'teamB'];
        const opponentScore = record.finalScore[isTeamA ? 'teamB' : 'teamA'];

        if (myScore > opponentScore) wins++;
        else if (myScore < opponentScore) losses++;
        else draws++;
    }

    return { wins, losses, draws, totalGames: wins + losses + draws };
}
