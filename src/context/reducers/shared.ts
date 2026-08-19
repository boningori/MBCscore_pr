import type { FoulEntry, FoulRecord, FoulType, Game, ScoreEntry } from '../../types/game';

/**
 * 選手のファウル欄へ、発生時刻の順に収まる位置で1つ追加する。
 *
 * 公式様式は player.fouls[i] の表記（P2 など）と、foulHistory を時刻順に並べた
 * i 番目のピリオド（記入色 1Q/3Q=赤・2Q/4Q/OT=黒）を対にして1マスを描く
 * （RunningScoresheet.renderPlayerRow）。ハーフタイムの太線位置も前半の
 * ファウル数から決まるので、並びが崩れると太線も別のファウルの右に出る。
 *
 * 単純に末尾へ足すと、発生より後に追加される経路で表記と色が入れ替わる:
 *   - EDIT_FOUL: 背番号の見間違いの付け替え（試合中いちばん多い訂正）
 *   - 保留ファウルの解決: 記録時のピリオドを持ったまま、あとから確定する
 * 実測では「Q3のTが1枠目・Q1の赤」「Q1のPが2枠目・Q3の色」になっていた。
 *
 * 位置は様式と同じ手順（この選手で絞り、timestamp で安定ソート）で求める。
 * 独自に「timestamp 以下の件数」で数えると、同じミリ秒に記録されたファウルの
 * 前後が様式側の安定ソートと食い違う。
 *
 * @param nextFoulHistory 追加・付け替えを反映した後の履歴
 * @param entryId 追加するファウルの FoulEntry.id
 */
export function insertFoulInOrder(
    fouls: (FoulType | FoulRecord)[],
    foul: FoulType | FoulRecord,
    nextFoulHistory: FoulEntry[],
    playerId: string,
    entryId: string,
): (FoulType | FoulRecord)[] {
    const ordered = nextFoulHistory
        .filter(f => f.playerId === playerId)
        .sort((a, b) => a.timestamp - b.timestamp);
    const index = ordered.findIndex(f => f.id === entryId);
    const next = [...fouls];
    // 履歴に見つからない・欄と件数が食い違う古いデータでは末尾へ（従来の挙動）
    next.splice(index === -1 ? next.length : index, 0, foul);
    return next;
}

/**
 * OT欄は直前ピリオドの数を種にして積み上がる（gameFlowHandlers の extendForOT）。
 * つまりOT欄には第4Qで犯したファウルが含まれている。第4Q以降のファウルを
 * 足し引きするときは、それを含んでいる後続のOT欄もまとめて動かさないと
 * 通算がずれ、ペナルティ判定（OT欄を見ている）が狂う。
 * Q1〜Q3は互いに独立なので、その枠だけを動かす。
 */
function adjustTeamFoul(teamFouls: number[], quarter: number, delta: number): number[] {
    const next = [...teamFouls];
    const apply = (index: number) => {
        if (index < 0 || index >= next.length) return;
        if (delta < 0 && next[index] <= 0) return;
        next[index] += delta;
    };

    apply(quarter - 1);
    if (quarter >= 4) {
        for (let i = quarter; i < next.length; i++) apply(i);
    }
    return next;
}

/**
 * 指定ピリオドのチームファウルを1つ増やした配列を返す。
 *
 * 現在のピリオドに足すぶんには最後の枠なので伝播先は無いが、保留アクションは
 * 記録された当時のピリオドへ後から足す。第4Qの保留をOT中に解決すると、
 * OT欄（第4Qからの通算）に伝わらず通算が1つ足りないままになっていた。
 * 減算側（decrementTeamFoul）とここを対にしておく。
 */
export function incrementTeamFoul(teamFouls: number[], quarter: number): number[] {
    return adjustTeamFoul(teamFouls, quarter, 1);
}

/** 指定ピリオドのチームファウルを1つ減らした配列を返す（0未満にはしない） */
export function decrementTeamFoul(teamFouls: number[], quarter: number): number[] {
    return adjustTeamFoul(teamFouls, quarter, -1);
}

// ヘルパー関数: ランニングスコアを再計算
export function recalculateRunningScores(
    scoreHistory: ScoreEntry[]
): ScoreEntry[] {
    // タイムスタンプ順にソート
    const sorted = [...scoreHistory].sort((a, b) => a.timestamp - b.timestamp);

    let runningA = 0;
    let runningB = 0;

    return sorted.map(entry => {
        runningA += entry.teamId === 'teamA' ? entry.points : 0;
        runningB += entry.teamId === 'teamB' ? entry.points : 0;
        return {
            ...entry,
            runningScoreA: runningA,
            runningScoreB: runningB,
        };
    });
}

/**
 * 訂正後の記録を付ける選手を決める。
 *
 * 指定が無い、または指定された選手がそのチームに居ない場合は元の選手を返す。
 * チーム外を許すと、加算側の map が誰にも当たらずスタッツだけが消える
 * （減算は元のチームに対して走るため、合計が静かに減る）。得点なら
 * スコアボードだけが減って得点履歴は残り、様式と食い違ったまま試合が終わる。
 *
 * 訂正の経路（EDIT_SCORE / EDIT_STAT / 成否の変換）はどれも同じ形をしているので、
 * 守りもここに1つ置いて全部から使う。以前は変換系にしか無かった。
 *
 * 元の選手が名簿に居ない場合（保留を「選手不明」で解決した記録）はそのまま
 * 返す。そこへ選手を割り当てるのが唯一の導線なので、塞いではいけない。
 */
export function resolveTargetPlayer(
    state: Game,
    teamId: string,
    currentPlayerId: string,
    newPlayerId: string | undefined,
): { playerId: string; playerNumber: number | null } {
    const team = teamId === 'teamA' ? state.teamA : state.teamB;
    if (!newPlayerId || newPlayerId === currentPlayerId) {
        return { playerId: currentPlayerId, playerNumber: null };
    }
    const target = team.players.find(p => p.id === newPlayerId);
    if (!target) return { playerId: currentPlayerId, playerNumber: null };
    return { playerId: target.id, playerNumber: target.number };
}
