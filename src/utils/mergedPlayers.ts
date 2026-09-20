// 割れた選手カードの手動統合。
//
// 選手の識別キーは氏名＋ライセンスNo.（playerStatsAnalysis の generatePlayerKey）。
// ライセンスNo.の揺れは名簿を手掛かりに自動で吸収しているが、手掛かりが氏名で
// ある以上「氏名が動くケース」は原理的に救えない（全角/半角スペースの混在、
// 誤字の訂正、コートネームで登録していた時期など。実測でいずれも2枚に割れる）。
//
// 自動判定はこれ以上ルールを足すと別人を混ぜる危険のほうが増えるので、
// 「安全側に倒した自動判定 ＋ 人が直せる出口」で完結させる。ここはその出口。
//
// 統合は集計時の名寄せで、試合記録（GameRecord）は一切書き換えない。
// だから解除は対応表から項目を消すだけで済み、間違えても記録は無傷。

import { createJsonStorage } from './createStorage';
import { migrateIdentityKey, normalizePlayerName } from './playerIdentityKey';

/** 記録上のキー → 代表キー */
export type MergeMap = Record<string, string>;
/** チームID → 対応表 */
export type AllMergedPlayers = Record<string, MergeMap>;

/** 代表キーを選ぶのに要る最小限のカード情報 */
export interface MergeChoice {
    playerKey: string;
    name: string;
    /** この選手のいちばん新しい試合日（ISO）。記録が無ければ空文字 */
    latestDate: string;
}

const isMergeMapRecord = (v: unknown): v is AllMergedPlayers =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

// 配列やnullが入っているとチームIDでの索引が壊れるため、素のオブジェクトのみ受ける
// （非表示選手ストレージと同じ判定）
const mergedStorage = createJsonStorage<AllMergedPlayers>(
    'minibasket-merged-players', {}, 'merged players', isMergeMapRecord,
);

/**
 * 氏名の比較用の正規化。空白（半角・全角）だけを取り除く。
 *
 * 実体は playerIdentityKey の normalizePlayerName。識別キーの氏名も同じ規則で
 * 均すので、2つの実装があると片方だけ直したときに静かに食い違う。
 */
export function normalizeNameForMerge(name: string): string {
    return normalizePlayerName(name);
}

/**
 * 保存済みの対応表のキーを、今の識別キーの形へ合わせ直す。
 *
 * キーは generatePlayerKey の戻り値がそのまま入っている。以前は
 * `氏名（空白そのまま）_ライセンスNo.そのもの` だったので、今の形と一致しない。
 * 一致しないまま放置すると、利用者が手で行った統合が黙って効かなくなる。
 */
function migrateMap(map: MergeMap): MergeMap {
    const migrated: MergeMap = {};
    for (const [from, to] of Object.entries(map)) {
        if (typeof to !== 'string') continue;
        const key = migrateIdentityKey(from);
        // 旧キーと新キーが両方保存されていると1つに畳まれる。どちらも同じ人を
        // 指すので寄り先は同じだが、決めておかないと読み込むたびに結果が変わる。
        // 先に現れたほうを残す
        if (key in migrated) continue;
        migrated[key] = migrateIdentityKey(to);
    }
    return migrated;
}

export function loadAllMergedPlayers(): AllMergedPlayers {
    const all = mergedStorage.load();
    const migrated: AllMergedPlayers = {};
    for (const [teamId, map] of Object.entries(all)) {
        // チーム単位の中身まで壊れている場合に備える（手で編集したバックアップ等）
        migrated[teamId] = isMergeMapRecord(map) ? migrateMap(map as MergeMap) : {};
    }
    return migrated;
}

export function loadMergedPlayers(teamId: string): MergeMap {
    return loadAllMergedPlayers()[teamId] ?? {};
}

export function saveMergedPlayers(teamId: string, map: MergeMap): void {
    const all = loadAllMergedPlayers();
    all[teamId] = map;
    mergedStorage.save(all);
}

/**
 * 記録上のキーを代表キーへ解決する。
 *
 * 対応表は深さ1に保っている（mergeKeys）ので参照は1回でよい。
 * 自分自身を指す項目は無視する。
 */
export function resolveMergedKey(map: MergeMap, key: string): string {
    const canonical = map[key];
    if (!canonical || canonical === key) return key;
    return canonical;
}

/**
 * キーの組を1つの代表へまとめた新しい対応表を返す（元の対応表は変えない）。
 *
 * 深さ1に保つため、次の2つを行う:
 *   - 代表が既に別の代表へ寄っていれば、その終端を代表にする
 *   - 既存項目のうち、今回まとめるキーを指しているものを新しい代表へ張り替える
 * これをしないと A→B→C の連鎖ができ、解決が何段になるか決まらなくなる。
 */
export function mergeKeys(map: MergeMap, keys: readonly string[], canonical: string): MergeMap {
    if (keys.length < 2) return { ...map };

    const target = resolveMergedKey(map, canonical);
    const merging = new Set(keys);
    const next: MergeMap = {};

    for (const [source, dest] of Object.entries(map)) {
        if (source === target) continue; // 代表自身への項目は残さない
        // 深さ1を保っているので、代表自身が別へ寄っている場合そこを指す項目は存在しない。
        // したがって「今回まとめるキーを指しているか」だけ見れば足りる
        next[source] = merging.has(dest) ? target : dest;
    }
    for (const key of keys) {
        if (key === target) continue;
        next[key] = target;
    }
    return next;
}

/** 指定した代表へ寄せている項目をすべて外した新しい対応表を返す */
export function unmergeKey(map: MergeMap, canonical: string): MergeMap {
    const next: MergeMap = {};
    for (const [source, dest] of Object.entries(map)) {
        if (dest === canonical) continue;
        next[source] = dest;
    }
    return next;
}

/** まとめ先になっている代表キーの集合（カードに「統合済み」を出すのに使う） */
export function mergedCanonicalKeys(map: MergeMap): Set<string> {
    return new Set(Object.values(map));
}

/**
 * まとめる組のどれを代表にするか決める。
 *
 * 代表の氏名がそのままカードに出るので、名簿どおりの表記になってほしい。
 * 名簿は「いま正しい情報」だから（既存の番号の寄せ方が、ユニフォーム番号を
 * 代表にするのと同じ考え方）。そこで優先度を3段にする:
 *
 *   0. 名簿と表記まで一致する
 *   1. 空白を無視すれば名簿に一致する
 *   2. 名簿に無い（コートネームや誤字）
 *
 * 空白を無視した一致だけで見ると、全角スペースと半角スペースのカードが
 * どちらも名簿に一致してしまい、肝心の「どちらの表記を残すか」を決められない。
 * 同じ優先度どうしは、記録がいちばん新しいカード。
 */
export function chooseCanonicalKey(
    cards: readonly MergeChoice[],
    rosterNames: readonly string[],
): string {
    if (cards.length === 0) return '';

    const exact = new Set(rosterNames);
    const loose = new Set(rosterNames.map(normalizeNameForMerge));
    const rank = (card: MergeChoice): number =>
        exact.has(card.name) ? 0
            : loose.has(normalizeNameForMerge(card.name)) ? 1
                : 2;

    let best = cards[0];
    for (const card of cards) {
        const diff = rank(card) - rank(best);
        // 優先度も日付も同値なら更新しない（`>` で `>=` ではない）ので、
        // 先に現れたカードが勝つ。呼び出し順が変わらない限り毎回同じ結果になる
        if (diff < 0 || (diff === 0 && card.latestDate > best.latestDate)) best = card;
    }
    return best.playerKey;
}

/**
 * 統合にあわせて非表示設定を引き継いだ新しい一覧を返す。
 *
 * 統合するとキーが変わるので、引き継がないと非表示にしていた選手が
 * 統合した瞬間に一覧へ復活したように見える。
 */
export function carryOverHidden(
    hidden: readonly string[],
    mergedKeys: readonly string[],
    canonical: string,
): string[] {
    const merging = new Set(mergedKeys);
    const anyHidden = hidden.some(key => merging.has(key));
    const rest = hidden.filter(key => !merging.has(key));
    if (!anyHidden) return rest;
    return rest.includes(canonical) ? rest : [...rest, canonical];
}
