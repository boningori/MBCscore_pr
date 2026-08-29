// 保存済みデータから読み戻したチームに、後から足したフィールドを補う。
//
// 記録エンジンが作るチームは createTeam を通るので全部そろっている。欠けるのは
// 「保存されたあとに増えたフィールドを持たない古いデータ」と「手で編集した
// バックアップJSONを取り込んだデータ」の2つ。どちらも配列を前提にしている
// 描画側（公式様式はコーチ行・A.コーチ行・タイムアウト欄・チームファウル欄を
// 添字で引く）で落ちる。
//
// 中断セッションの復元（handleRestoreGame）は assistantCoachFouls と benchFouls
// だけを補っていて、履歴から様式を開く経路（History の recordToGame）は何も
// 補っていなかった。同じデータを読む2つの入口で前提が違うのは危ういので、
// ここに1つだけ置いて両方から使う。
//
// 選手ごとのフィールドもここで補う。かつては「読む側が未設定を許容している」
// 前提でチーム単位の配列だけを埋めていたが、許容していたのは fouls?.length と
// quartersPlayed?.filter だけで、stats はどの読み手も素で引いていた
// （公式様式・チーム比較・選手スタッツ分析）。実測: 1レコードの1選手から stats を
// 落とすと、選手スタッツ分析と履歴の試合詳細が
// 「Cannot read properties of undefined (reading 'points')」で落ち、
// ErrorBoundary によってアプリ全体がエラー画面に置き換わる。データは
// localStorage に残るのでリロードしても再発し、エラー画面はどのレコードが
// 原因かを示さないため利用者には直しようがない。
// 「読み手が覚えていなければならない例外」を残さず、ここで揃える。

import type { Player, Team } from '../types/game';
import { createInitialStats } from '../types/game';

/**
 * 欠けている選手ごとのフィールドを補った選手を返す（欠けていなければそのまま返す）。
 *
 * quartersPlayed の枠数はチームのピリオド数に合わせる。4つ固定で補うと、OTに
 * 入った試合で teamFouls と長さが食い違い、様式の出場欄が最後のピリオドだけ
 * undefined になる（試合中に足した選手の handleAddPlayerToTeam と同じ数え方）。
 */
function migratePlayer(player: Player, periodCount: number): Player {
    if (!player) return player;

    const stats = player.stats ?? createInitialStats();
    const fouls = Array.isArray(player.fouls) ? player.fouls : [];
    const quartersPlayed = Array.isArray(player.quartersPlayed)
        ? player.quartersPlayed
        : Array<false>(periodCount).fill(false);

    if (stats === player.stats && fouls === player.fouls && quartersPlayed === player.quartersPlayed) {
        return player;
    }
    return { ...player, stats, fouls, quartersPlayed };
}

/** 欠けている配列を空で補ったチームを返す（欠けていなければそのまま返す） */
export function migrateTeam(team: Team): Team {
    if (!team) return team;

    const timeouts = team.timeouts ?? [];
    const teamFouls = team.teamFouls ?? [0, 0, 0, 0];
    const coachFouls = team.coachFouls ?? [];
    const assistantCoachFouls = team.assistantCoachFouls ?? [];
    const benchFouls = team.benchFouls ?? [];

    const rawPlayers = team.players ?? [];
    const periodCount = Math.max(4, teamFouls.length);
    const migratedPlayers = rawPlayers.map(p => migratePlayer(p, periodCount));
    // 全員そのままなら配列も作り直さない（下の参照比較で同じチームを返すため）
    const players = migratedPlayers.every((p, i) => p === rawPlayers[i]) ? rawPlayers : migratedPlayers;

    const unchanged =
        players === team.players &&
        timeouts === team.timeouts &&
        teamFouls === team.teamFouls &&
        coachFouls === team.coachFouls &&
        assistantCoachFouls === team.assistantCoachFouls &&
        benchFouls === team.benchFouls;
    // 参照が変わると useMemo や React.memo の比較が毎回外れる。
    // 補うものが無いときは同じオブジェクトを返す
    if (unchanged) return team;

    return { ...team, players, timeouts, teamFouls, coachFouls, assistantCoachFouls, benchFouls };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 何が入っているか分からない値をチームとして扱える形に整える。
 *
 * migrateTeam は「チームであること」を前提に欠けたフィールドを補うので、
 * null や文字列、players が配列でないものは相手にできない（実測: teamA が null の
 * レコードが1件あるだけで履歴一覧が Cannot read properties of null で落ちる）。
 * バックアップの取り込みと履歴の読み込みの両方から使うため、ここに1つだけ置く。
 *
 * 直すところが無ければ渡された値をそのまま返す（migrateTeam と同じ参照維持）。
 */
export function coerceTeam(value: unknown): Team {
    if (!isPlainObject(value)) return migrateTeam({ players: [] } as unknown as Team);

    const raw = value.players;
    const players = Array.isArray(raw)
        ? (raw.every(isPlainObject) ? raw : raw.filter(isPlainObject))
        : [];
    const base = players === raw ? value : { ...value, players };
    return migrateTeam(base as unknown as Team);
}
