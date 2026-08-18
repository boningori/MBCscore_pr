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
// 埋めるのはチーム単位の配列に絞る。選手ごとのフィールドは読む側が
// 未設定を許容している（playerStatsAnalysis の fouls?.length など）。

import type { Team } from '../types/game';

/** 欠けている配列を空で補ったチームを返す（欠けていなければそのまま返す） */
export function migrateTeam(team: Team): Team {
    if (!team) return team;

    const players = team.players ?? [];
    const timeouts = team.timeouts ?? [];
    const teamFouls = team.teamFouls ?? [0, 0, 0, 0];
    const coachFouls = team.coachFouls ?? [];
    const assistantCoachFouls = team.assistantCoachFouls ?? [];
    const benchFouls = team.benchFouls ?? [];

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
