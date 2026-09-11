// スナップショットの保持則。IndexedDB は触らない。
//
// 旧実装は「新しい順に10世代」だけで、判断が saveSnapshot の IndexedDB
// トランザクションに埋まっていた。試合中の自動保存は最短30秒間隔で走るため、
// 1試合録るだけで全世代がその試合の最後の5分で埋まり、それ以前は全部
// 押し出されていた。MirrorBackupList が自分で「誤って削除した・不正なデータを
// 取り込んで上書きした場合を救う」と書いているのに、それらは気づくのが
// 数時間〜数日後で、まったく噛み合っていなかった。
//
// 枠を2つに分けるのが要点。試合中の定期スナップショットは回転枠の中だけで
// 入れ替わり、区切り（試合を保存した直後・日々の起動・復元の直前）を
// 押し出さない。判断をここに出したので、IndexedDB 抜きで直接検査できる。

import { formatInputDate } from './localDate';

export type SnapshotReason = 'periodic' | 'gameEnd' | 'startup' | 'beforeRestore';

/** 一覧と保持の判断に要る情報。entries を読まずに得られるものだけ */
export interface SnapshotMeta {
    timestamp: number;
    /** v1 が書いた世代は持たない（未設定＝periodic 扱い） */
    reason?: SnapshotReason;
}

/**
 * 定期（回転）の保持数。
 * 試合中の消失で実際に使うのは最新1件（RestorePrompt は getLatestSnapshot を見る）。
 * 残り2件は保険で、それ以上は枠を食うだけになる。
 */
export const MAX_PERIODIC = 3;

/**
 * 区切り（保護）の保持数。
 * 週2試合＋週3日起動で約2.4週間分にあたる。
 */
export const MAX_MILESTONES = 12;

/**
 * 区切りの世代か。
 *
 * 未設定（v1 が書いた世代）は定期として扱う。旧世代は試合中の自動保存が
 * ほとんどで、保護する意味が薄いため。
 */
export function isMilestone(reason?: SnapshotReason): boolean {
    return reason !== undefined && reason !== 'periodic';
}

/**
 * 消すべき世代の timestamp を返す。
 *
 * 定期と区切りを別々に数え、それぞれ新しいほうから枠のぶんだけ残す。
 * 渡された配列は書き換えない。
 */
export function selectExpiredSnapshots(metas: SnapshotMeta[]): number[] {
    const newestFirst = [...metas].sort((a, b) => b.timestamp - a.timestamp);

    let periodicKept = 0;
    let milestoneKept = 0;
    const expired: number[] = [];

    for (const meta of newestFirst) {
        if (isMilestone(meta.reason)) {
            if (milestoneKept < MAX_MILESTONES) milestoneKept++;
            else expired.push(meta.timestamp);
        } else {
            if (periodicKept < MAX_PERIODIC) periodicKept++;
            else expired.push(meta.timestamp);
        }
    }

    return expired;
}

/**
 * 同じ暦日の startup が既にあるか。
 *
 * アプリを1日に5回開く人の起動世代で保護枠が埋まると、古い区切りが
 * 押し出される。起動世代は1日1つに絞る。
 *
 * 暦日は現地時刻で見る。UTC で切ると日本では朝9時前が前日になり、
 * 9時開始・8時台受付のミニバスでは日常的に起きる（localDate.ts 参照）。
 */
export function hasStartupSnapshotToday(metas: SnapshotMeta[], now: number): boolean {
    const today = formatInputDate(new Date(now));
    return metas.some(
        meta => meta.reason === 'startup' && formatInputDate(new Date(meta.timestamp)) === today,
    );
}
