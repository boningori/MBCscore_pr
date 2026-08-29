// 壊れた試合レコードを、読み込みの時点で描画できる形に整える。
//
// 記録エンジンが作るレコードは saveGameResult を通るので形がそろっている。
// 崩れるのは「手で編集したバックアップJSONを取り込んだ」「共有の途中で切れた
// ファイルを取り込んだ」の2つで、これは migrateTeam / resolveFinalScore が
// 相手にしてきたのと同じ状況である。
//
// 違うのは範囲だった。teamA/teamB と finalScore は取り込み時（sanitizeImportedGame）に
// 直していたが、scoreHistory・statHistory・foulHistory・pendingActions・gameName は
// 素通しで、読み手はどこも配列や文字列であることを前提に引いていた。
//
// 実測（実ブラウザ・v1.6.8・1件だけ仕込んで履歴から開く）:
//   scoreHistory が配列でない  → 試合詳細で TypeError: scoreHistory.some is not a function
//   scoreHistory の要素が null → 試合詳細で Cannot read properties of null (reading 'scoreType')
//   statHistory の要素が null  → 試合詳細で Cannot read properties of null (reading 'statType')
//   foulHistory の要素が null  → スコアシートタブで Cannot read properties of null (reading 'playerId')
//   pendingActions が配列でない → スタッツタブで pendingActions.map is not a function
//   gameName が文字列でない    → 試合詳細で (gameName ?? "").trim is not a function
//   teamA が null              → 履歴一覧で Cannot read properties of null (reading 'name')
// いずれも ErrorBoundary によってアプリ全体がエラー画面に置き換わる。データは
// localStorage に残るのでリロードしても再発し、エラー画面はどのレコードが原因かを
// 示さないため、利用者には手の打ちようがない。
//
// 直す場所を loadGameHistory の1か所にしたのは、読み手（履歴一覧・試合詳細・
// 公式様式・チーム比較・選手スタッツ分析・バックアップ・CSV）が全部そこを通るため。
// 取り込み時だけ直すと、旧バージョンで取り込み済みのレコードが残ったままになる。
//
// 捨てるのは「オブジェクトでないもの」だけに限る。読み込み結果は書き戻される
// （dedupeGameIds と同じ扱い）ので、判断を誤ると記録が永久に消える。

import type { GameRecord } from './gameHistoryStorage';
import { coerceTeam } from './migrateTeam';
import { coerceEntries, isPlainObject } from './coerceStored';

/** 試合名。数値などが入っていても文字にして残す（捨てない） */
function coerceGameName(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

/** 1件を整える（直すところが無ければ同じオブジェクトを返す） */
export function repairGameRecord(record: GameRecord): GameRecord {
    const teamA = coerceTeam(record.teamA);
    const teamB = coerceTeam(record.teamB);
    const scoreHistory = coerceEntries<GameRecord['scoreHistory'][number]>(record.scoreHistory);
    const statHistory = coerceEntries<GameRecord['statHistory'][number]>(record.statHistory);
    const foulHistory = coerceEntries<GameRecord['foulHistory'][number]>(record.foulHistory);
    const gameName = coerceGameName(record.gameName);

    // pendingActions は任意フィールド。無いものを空配列で足すと
    // 「未割り当てがあった試合」との区別がつかなくなるので、無ければ触らない
    const hasPending = record.pendingActions !== undefined;
    const pendingActions = hasPending
        ? coerceEntries<NonNullable<GameRecord['pendingActions']>[number]>(record.pendingActions)
        : undefined;

    const unchanged =
        teamA === record.teamA &&
        teamB === record.teamB &&
        scoreHistory === record.scoreHistory &&
        statHistory === record.statHistory &&
        foulHistory === record.foulHistory &&
        gameName === record.gameName &&
        pendingActions === record.pendingActions;
    if (unchanged) return record;

    return {
        ...record,
        teamA,
        teamB,
        scoreHistory,
        statHistory,
        foulHistory,
        gameName,
        ...(hasPending ? { pendingActions } : {}),
    };
}

/**
 * 履歴をまとめて整える。直すところが無ければ null（＝書き戻し不要）。
 * dedupeGameIds と同じ約束にしてある。
 */
export function repairGameRecords(records: GameRecord[]): GameRecord[] | null {
    let changed = false;
    const repaired: GameRecord[] = [];

    for (const record of records) {
        // オブジェクトでない要素は試合として復元しようがない。
        // ここだけは捨てる（残すと record.id を読んだ時点で一覧ごと落ちる）
        if (!isPlainObject(record)) {
            changed = true;
            continue;
        }
        const fixed = repairGameRecord(record);
        if (fixed !== record) changed = true;
        repaired.push(fixed);
    }

    return changed ? repaired : null;
}
