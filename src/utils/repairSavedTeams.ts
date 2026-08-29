// 保存済みチーム（マイチーム・対戦チーム）を、読み込みの時点で描画できる形に整える。
//
// teamStorage の検査は「配列であること」までで、要素の中身は素通しだった。
// 手で編集した／共有の途中で切れたバックアップを取り込むと、そこが崩れる。
//
// 実測（v1.6.9・実ブラウザ・1件だけ仕込んでチーム管理画面を開く）:
//   要素が null          → Cannot read properties of null (reading 'name')
//   要素が文字列          → Cannot read properties of undefined (reading 'length')
//   要素が空オブジェクト   → Cannot read properties of undefined (reading 'length')
//   players が null      → Cannot read properties of null (reading 'length')
//   players が文字列      → team.players.slice(...).map is not a function
//   players の要素が null → Cannot read properties of null (reading 'bibNumber')
// いずれも ErrorBoundary によってアプリ全体がエラー画面に置き換わり、
// localStorage に残るのでリロードしても再発する。
//
// 試合履歴に対する repairGameRecords と同じ考え方で、読み込みの1か所で直す。
// 捨てるのは「チームとして復元しようがない要素」だけに限る。読み込み結果は
// 書き戻されるので、判断を誤ると登録したチームが永久に消える。

import type { SavedTeam } from './teamStorage';
import { coerceEntries, isPlainObject } from './coerceStored';

/** 1チームを整える（直すところが無ければ同じオブジェクトを返す） */
export function repairSavedTeam(team: SavedTeam): SavedTeam {
    const players = coerceEntries<SavedTeam['players'][number]>(team.players);
    if (players === team.players) return team;
    return { ...team, players };
}

/**
 * チーム一覧をまとめて整える。直すところが無ければ null（＝書き戻し不要）。
 * dedupeGameIds / repairGameRecords と同じ約束にしてある。
 */
export function repairSavedTeams(teams: SavedTeam[]): SavedTeam[] | null {
    let changed = false;
    const repaired: SavedTeam[] = [];

    for (const team of teams) {
        // オブジェクトでない要素はチームとして復元しようがない。
        // 残すと team.name を読んだ時点で一覧ごと落ちる
        if (!isPlainObject(team)) {
            changed = true;
            continue;
        }
        // name が無いと一覧に「名前のない行」が出るだけで落ちはしないが、
        // 選択・削除の手掛かりが無くなるので既定の名前を与える
        const named = typeof team.name === 'string' ? team : { ...team, name: String(team.name ?? '名称未設定') };
        const fixed = repairSavedTeam(named as SavedTeam);
        if (fixed !== team) changed = true;
        repaired.push(fixed);
    }

    return changed ? repaired : null;
}
