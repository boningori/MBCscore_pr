import type {
    Game,
    PayloadOf,
    FoulEntry,
    FoulType,
    FoulRecord,
    CoachFoulTarget,
    ScoreEntry,
    StatEntry,
} from '../../types/game';
import { recalculateRunningScores, incrementTeamFoul, decrementTeamFoul, insertFoulInOrder } from './shared';

/**
 * コーチ・ベンチのファウルを ADD_FOUL で記録してはいけない。
 *
 * この経路は3つの行き先を持っていた: コーチ本人は coachFouls、A.コーチは
 * assistantCoachFouls だけ（FT付きフローが対で入れるコーチ行のBが無い）、
 * ベンチ関係者と種別なしは benchFouls。
 *
 * このうち benchFouls は公式様式のどこにも描かれない（RunningScoresheet の
 * 名簿表はコーチ行とA.コーチ行しか持たない）。つまりここへ書いた記録は、
 * 履歴には残るのに様式からは消える。A.コーチも、取り消し側が対で 'BT' を
 * 引くため、コーチ行の別のマークを巻き込む。
 *
 * いまのUIはベンチテクニカルを必ずFT付きフロー（handleAddFoulWithFreeThrows）
 * へ通す。そちらは3種とも様式が印字する場所へ書く。この分岐は到達しないまま
 * 不整合だけを抱えていたので塞ぐ。
 *
 * 古いバージョンはUIからこの経路を使っていた（playerId: 'BENCH' / null）。
 * そのころの記録は benchFouls に残っているため、読み出し側（handleRemoveFoul の
 * 旧データ用フォールバック、RunningScoresheet の writesToCoachRow）は残す。
 */
function isCoachOrBenchId(playerId: string | null): boolean {
    return playerId === 'COACH' || playerId === 'ACOACH' || playerId === 'BENCH' || !playerId;
}

export function handleAddFoul(state: Game, payload: PayloadOf<'ADD_FOUL'>): Game {
    const { teamId, playerId, foulType } = payload;

    // 様式に出ない場所へ記録を落とさない（詳細は isCoachOrBenchId のコメント）
    if (isCoachOrBenchId(playerId)) return state;

    const player = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);

    const updateTeamFoul = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;

        // 通常のプレイヤーファウルのみチームファウルを加算
        return {
            ...team,
            teamFouls: incrementTeamFoul(team.teamFouls, state.currentQuarter),
            players: team.players.map(p => {
                if (p.id !== playerId) return p;
                return { ...p, fouls: [...p.fouls, foulType] };
            })
        };
    };

    // ファウル履歴エントリを作成（コーチ・ベンチは上で弾いてあるので必ず選手）
    const foulEntry: FoulEntry = {
        id: crypto.randomUUID(),
        teamId,
        playerId,
        playerNumber: player?.number || 0,
        foulType,
        quarter: state.currentQuarter,
        timestamp: Date.now(),
        isCoachOrBench: false,
        coachFoulTarget: null,
    };

    return {
        ...state,
        teamA: updateTeamFoul(state.teamA, teamId === 'teamA'),
        teamB: updateTeamFoul(state.teamB, teamId === 'teamB'),
        foulHistory: [...state.foulHistory, foulEntry],
        selectedPlayerId: null,
        selectedTeamId: null,
    };
}

export function handleAddFoulWithFreeThrows(state: Game, payload: PayloadOf<'ADD_FOUL_WITH_FREE_THROWS'>): Game {
    const {
        teamId,
        playerId,
        foulType,
        shotSituation,
        freeThrows,
        freeThrowResults,
        shooterTeamId,
        shooterPlayerId,
        shotMade,
        benchTechType,  // ベンチテクニカルの種類（HC/AC/Sub/Bench）
    } = payload;

    // ベンチテクニカル関連の判定
    const isCoachOrBench = playerId === 'COACH' || playerId === 'ACOACH' || playerId === 'BENCH' || !playerId;
    const coachFoulTargetFT: CoachFoulTarget = playerId === 'COACH' ? 'COACH'
        : playerId === 'ACOACH' ? 'ACOACH'
            : playerId === 'BENCH' ? 'BENCH'
                : benchTechType === 'Sub' ? 'BENCH'  // 交代要員のテクニカルはコーチ行へのBとして扱う
                    : null;
    const foulingPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === playerId);
    const shooterPlayer = [...state.teamA.players, ...state.teamB.players].find(p => p.id === shooterPlayerId);

    // FT成功数を計算
    const ftMade = freeThrowResults.filter(r => r === 'made').length;

    // ファウル記録（FoulRecord形式）
    const foulRecord: FoulRecord = {
        type: foulType,
        freeThrows,
        freeThrowResults: freeThrowResults.length > 0 ? freeThrowResults : undefined,
    };

    // ファウルをしたチームを更新
    const updateFoulingTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;

        // コーチファウル（監督本人）: コーチ行に「C」(T)
        if (playerId === 'COACH') {
            return {
                ...team,
                coachFouls: [...team.coachFouls, foulType],  // 'T' → 表示は「C」
            };
        }

        // A.コーチファウル: A.コーチ行に「C」(T)、コーチ行に「B」(BT)
        if (playerId === 'ACOACH') {
            return {
                ...team,
                assistantCoachFouls: [...team.assistantCoachFouls, foulType],  // 'T' → 表示は「C」
                coachFouls: [...team.coachFouls, 'BT' as FoulType],  // ダブルカウント: コーチ行に「B」
            };
        }

        // ベンチ関係者ファウル: コーチ行に「B」(BT)のみ
        if (playerId === 'BENCH' || (!playerId && !benchTechType)) {
            return {
                ...team,
                coachFouls: [...team.coachFouls, 'BT' as FoulType],  // コーチ行に「B」
            };
        }

        // 交代要員のテクニカル: 選手行に「T」、コーチ行に「B」(BT)
        // チームファウルには加算しない
        if (benchTechType === 'Sub' && foulingPlayer) {
            return {
                ...team,
                coachFouls: [...team.coachFouls, 'BT' as FoulType],  // ダブルカウント: コーチ行に「B」
                players: team.players.map(p => {
                    if (p.id !== playerId) return p;
                    return { ...p, fouls: [...p.fouls, foulRecord] };  // 選手行に「T」
                })
            };
        }

        // 通常のプレイヤーファウル（コート上の選手）はチームファウルを加算
        return {
            ...team,
            teamFouls: incrementTeamFoul(team.teamFouls, state.currentQuarter),
            players: team.players.map(p => {
                if (p.id !== playerId) return p;
                return { ...p, fouls: [...p.fouls, foulRecord] };
            })
        };
    };

    // バスケットカウント（シュート成功）の得点
    const basketPoints = shotMade && shotSituation !== 'none' ? (shotSituation === '3P' ? 3 : 2) : 0;

    // シューターチームを更新（バスケット得点 + FT得点とスタッツ）
    const updateShooterTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget || !shooterPlayerId) return team;
        if (freeThrows === 0 && !shotMade) return team;

        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== shooterPlayerId) return p;
                const stats = { ...p.stats };
                // バスケットカウント：シュート成功分のスタッツ
                if (shotMade && shotSituation !== 'none') {
                    if (shotSituation === '2P') {
                        stats.twoPointAttempt += 1;
                        stats.twoPointMade += 1;
                    } else {
                        stats.threePointAttempt += 1;
                        stats.threePointMade += 1;
                    }
                    stats.points += basketPoints;
                }
                // FTスタッツ
                if (freeThrows > 0) {
                    stats.freeThrowAttempt += freeThrows;
                    stats.freeThrowMade += ftMade;
                    stats.points += ftMade;
                }
                return { ...p, stats };
            })
        };
    };

    // ファウル履歴エントリを作成
    // 交代要員の場合はplayerIdとplayerNumberを記録（選手行にTが記録されるため）
    const isSubstitute = benchTechType === 'Sub';
    const foulEntry: FoulEntry = {
        id: crypto.randomUUID(),
        teamId,
        playerId: isSubstitute ? playerId : (isCoachOrBench ? null : playerId),
        playerNumber: isSubstitute ? (foulingPlayer?.number || 0) : (isCoachOrBench ? -1 : (foulingPlayer?.number || 0)),
        foulType,
        quarter: state.currentQuarter,
        timestamp: Date.now(),
        isCoachOrBench: isCoachOrBench && !isSubstitute,  // 交代要員は選手扱い
        coachFoulTarget: coachFoulTargetFT,
        freeThrows,
        freeThrowResults,
        shotSituation,
        shotMade: shotMade || undefined,
        shooterTeamId: (freeThrows > 0 || shotMade) ? shooterTeamId : undefined,
        shooterPlayerId: (freeThrows > 0 || shotMade) ? shooterPlayerId : undefined,
        shooterPlayerNumber: (freeThrows > 0 || shotMade) ? (shooterPlayer?.number || 0) : undefined,
    };

    // チーム更新（ファウル側）
    let newTeamA = updateFoulingTeam(state.teamA, teamId === 'teamA');
    let newTeamB = updateFoulingTeam(state.teamB, teamId === 'teamB');

    // チーム更新（シューター側）
    newTeamA = updateShooterTeam(newTeamA, shooterTeamId === 'teamA');
    newTeamB = updateShooterTeam(newTeamB, shooterTeamId === 'teamB');

    // スコア履歴を追加（バスケット + FT）
    const newScoreHistory = [...state.scoreHistory];
    const now = Date.now();

    // バスケットカウント（シュート成功）のスコア履歴
    if (shotMade && basketPoints > 0 && shooterPlayerId) {
        const finalScoreA = newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0);
        const finalScoreB = newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0);
        const basketScoreA = shooterTeamId === 'teamA' ? finalScoreA - ftMade : finalScoreA;
        const basketScoreB = shooterTeamId === 'teamB' ? finalScoreB - ftMade : finalScoreB;

        const basketEntry: ScoreEntry = {
            id: crypto.randomUUID(),
            teamId: shooterTeamId,
            playerId: shooterPlayerId,
            playerNumber: shooterPlayer?.number || 0,
            scoreType: shotSituation === '3P' ? '3P' : '2P',
            points: basketPoints,
            quarter: state.currentQuarter,
            timestamp: now,
            runningScoreA: basketScoreA,
            runningScoreB: basketScoreB,
            sourceFoulId: foulEntry.id,
        };
        newScoreHistory.push(basketEntry);
    }

    // FT成功分のスコア履歴
    if (ftMade > 0 && shooterPlayerId) {
        const finalScoreA = newTeamA.players.reduce((sum, p) => sum + p.stats.points, 0);
        const finalScoreB = newTeamB.players.reduce((sum, p) => sum + p.stats.points, 0);

        const baseScoreA = shooterTeamId === 'teamA' ? finalScoreA - ftMade : finalScoreA;
        const baseScoreB = shooterTeamId === 'teamB' ? finalScoreB - ftMade : finalScoreB;

        for (let i = 0; i < ftMade; i++) {
            const scoreEntry: ScoreEntry = {
                id: crypto.randomUUID(),
                teamId: shooterTeamId,
                playerId: shooterPlayerId,
                playerNumber: shooterPlayer?.number || 0,
                scoreType: 'FT',
                points: 1,
                quarter: state.currentQuarter,
                timestamp: now + 1 + i,
                runningScoreA: shooterTeamId === 'teamA' ? baseScoreA + (i + 1) : baseScoreA,
                runningScoreB: shooterTeamId === 'teamB' ? baseScoreB + (i + 1) : baseScoreB,
                sourceFoulId: foulEntry.id,
            };
            newScoreHistory.push(scoreEntry);
        }
    }

    return {
        ...state,
        teamA: newTeamA,
        teamB: newTeamB,
        scoreHistory: newScoreHistory,
        foulHistory: [...state.foulHistory, foulEntry],
        selectedPlayerId: null,
        selectedTeamId: null,
    };
}

/**
 * 交代要員のテクニカルか。
 *
 * このファウルだけは「選手行にT・コーチ行にB」で、チームファウルには入らない
 * （handleAddFoulWithFreeThrows の benchTechType === 'Sub' 分岐）。
 * 記録側では isCoachOrBench を false にして選手扱いしているため、
 * 取り消し側は playerId と coachFoulTarget の組み合わせで見分ける。
 */
function isSubstituteTech(entry: FoulEntry): boolean {
    return entry.playerId !== null && entry.coachFoulTarget === 'BENCH';
}

/** 配列から最初の該当を1つだけ取り除く。無ければ元の配列をそのまま返す */
function removeOneFoul(list: FoulType[], target: FoulType): FoulType[] {
    const index = list.findIndex(f => f === target);
    if (index === -1) return list;
    const next = [...list];
    next.splice(index, 1);
    return next;
}

/**
 * 記録内容から、取り消すファウルの位置を推測する（見つからなければ -1）。
 *
 * 欄と履歴の件数が食い違う古いデータ向けの最後の手段。通常は時刻順の位置で
 * 引く（findFoulIndex）。内容一致だと、同じ種別・同じFT本数のファウルを
 * 2つ持つ選手で必ず先頭が当たるため、後の1つを訂正したつもりで前のマスが
 * 消える。
 *
 * 同じ選手が同種のファウルを複数持つのは普通にある（P と P2 など）。
 * 種類だけで探すと取り違えが増えるので、FT本数まで一致するものを優先し、
 * 一致が無いときだけ種類で妥協する。
 */
function findFoulIndexByContent(fouls: (FoulType | FoulRecord)[], entry: FoulEntry): number {
    if (entry.freeThrows === undefined) {
        // ADD_FOUL 由来はFoulType文字列で入っている
        const legacy = fouls.findIndex(f => typeof f === 'string' && f === entry.foulType);
        if (legacy !== -1) return legacy;
    } else {
        const exact = fouls.findIndex(f =>
            typeof f !== 'string' && f.type === entry.foulType && (f.freeThrows ?? 0) === entry.freeThrows);
        if (exact !== -1) return exact;
    }
    return fouls.findIndex(f => (typeof f === 'string' ? f : f.type) === entry.foulType);
}

/**
 * 取り消す・付け替えるファウルが、その選手のファウル欄の何番目かを返す
 * （決められなければ -1）。
 *
 * 様式は player.fouls[i] の表記（P2 など）と、その選手の foulHistory を時刻順に
 * 並べた i 番目のピリオド（記入色 1Q/3Q=赤・2Q/4Q/OT=黒）を対にして1マスを描く
 * （RunningScoresheet.renderPlayerRow）。だから位置は履歴の時刻順で決まる。
 * 追加側（insertFoulInOrder）と同じ手順で引くこと。
 *
 * 内容一致で探すと、同じ種別・同じFT本数のファウルを2つ持つ選手で必ず先頭が
 * 当たる。実測: Q1にP・Q2にT1・Q3にP の選手からQ3のPを取り消すと、欄1が
 * 「T1」でQ1の赤、欄2が「P」でQ2の色になり、残った2つとも別のファウルとして
 * 印字されていた。P が2つ付くのは珍しくないので、訂正のたびに起きうる。
 *
 * @param foulHistory 取り消し・付け替えを反映する前の履歴（entry を含む）
 */
function findFoulIndex(
    fouls: (FoulType | FoulRecord)[],
    foulHistory: FoulEntry[],
    entry: FoulEntry,
): number {
    const ordered = foulHistory
        .filter(f => f.playerId === entry.playerId)
        .sort((a, b) => a.timestamp - b.timestamp);
    // 欄と履歴の件数が揃っているときだけ位置で引ける。
    // 食い違う古いデータは従来どおり内容から推測する
    if (ordered.length === fouls.length) {
        const index = ordered.findIndex(f => f.id === entry.id);
        if (index !== -1) return index;
    }
    return findFoulIndexByContent(fouls, entry);
}

/**
 * ファウルをした選手を付け替える。
 *
 * 背番号の見間違いは試合中いちばん起きやすい訂正で、ファウルはとくに多い。
 * これまで履歴の「編集」はファウル行にも出ていたが、保存しても何も起きなかった
 * （ActionHistory の handleEditSave が score/stat しか分岐を持っていなかった）。
 * 保存できたように見えるぶん、取り違えたまま試合が終わる。
 *
 * 動かすのは「誰が犯したか」だけに絞る:
 *   - FTの得点・スタッツは相手チームのシューターに付いているので無関係
 *   - チームファウルは同じチーム内の移動では増減しない（だから相手チームへは移さない）
 *   - 種別とFT本数を変えると公式様式の表記もFTの本数も辻褄が合わなくなるため、
 *     そこは削除して入れ直す
 *
 * コーチ・ベンチのファウルは移す先の選手行が無いので受け付けない。
 * 交代要員のテクニカルは選手行に入っている（isCoachOrBench が false）ので移せる。
 * コーチ行のBは付け替えでは動かない（誰が犯しても1つ計上される）。
 */
export function handleEditFoul(state: Game, payload: PayloadOf<'EDIT_FOUL'>): Game {
    const { entryId, newPlayerId } = payload;
    const entry = state.foulHistory.find(f => f.id === entryId);
    if (!entry) return state;
    if (entry.isCoachOrBench || !entry.playerId) return state;
    if (entry.playerId === newPlayerId) return state;

    const isTeamA = entry.teamId === 'teamA';
    const team = isTeamA ? state.teamA : state.teamB;
    const newPlayer = team.players.find(p => p.id === newPlayerId);
    // 相手チームの選手はチームファウルの帰属が変わるので受け付けない
    if (!newPlayer) return state;

    const oldPlayer = team.players.find(p => p.id === entry.playerId);
    if (!oldPlayer) return state;
    // 同じ種類が複数あっても取り違えないよう、時刻順の位置で1つだけ取り出す
    const foulIndex = findFoulIndex(oldPlayer.fouls, state.foulHistory, entry);
    if (foulIndex === -1) return state;
    const moved = oldPlayer.fouls[foulIndex];

    const nextFoulHistory = state.foulHistory.map(f => f.id === entryId
        ? { ...f, playerId: newPlayerId, playerNumber: newPlayer.number }
        : f);

    const players = team.players.map(p => {
        if (p.id === entry.playerId) {
            const fouls = [...p.fouls];
            fouls.splice(foulIndex, 1);
            return { ...p, fouls };
        }
        if (p.id === newPlayerId) {
            // 末尾ではなく発生順の位置へ入れる。付け替え先が後のクォーターの
            // ファウルを既に持っていると、様式の表記と記入色が入れ替わる
            return {
                ...p,
                fouls: insertFoulInOrder(p.fouls, moved, nextFoulHistory, newPlayerId, entryId),
            };
        }
        return p;
    });

    const updatedTeam = { ...team, players };

    return {
        ...state,
        teamA: isTeamA ? updatedTeam : state.teamA,
        teamB: isTeamA ? state.teamB : updatedTeam,
        foulHistory: nextFoulHistory,
    };
}

/**
 * FTの成否だけを訂正する。
 *
 * 外したFTは記録を1件も作らない —— 成功したFTは ScoreEntry になるが、外した
 * ぶんはシューターの freeThrowAttempt に本数として乗るだけで、アクション履歴に
 * 現れない。そのため「外した」を「入った」に直す導線がどこにも無く、ファウルごと
 * 削除して入れ直す（選手選択・種別・シュート状況・シューター・本数を全部やり直す）
 * しかなかった。試合中の誤タップとしてはいちばん起きやすいのに、いちばん高くつく。
 *
 * 動かすのは成否だけに絞る。本数と種別を変えられるようにすると、公式様式の表記と
 * FTの本数が辻褄の合わない組み合わせを作れてしまう（handleEditFoul と同じ判断）。
 *
 * 紐付きが崩れている記録は受け付けない:
 *   - 成功したFTを「やっぱりミス」と直した（sourceFoulId 付きの FTA がある）
 *   - シューターを別の選手へ付け替えた
 * どちらもこのファウルのFT本数と得点エントリが1対1で対応しなくなるため、ここで
 * 差分を当てると帳尻が合わない。UI側もその場合は編集を出さない（canEditFreeThrows）。
 */
export function canEditFreeThrows(
    entry: FoulEntry,
    scoreHistory: ScoreEntry[],
    statHistory: StatEntry[],
): boolean {
    const freeThrows = entry.freeThrows ?? 0;
    if (freeThrows <= 0) return false;
    if (!entry.shooterPlayerId || !entry.shooterTeamId) return false;

    const oldMade = (entry.freeThrowResults ?? []).filter(r => r === 'made').length;
    // ミスへ変換した記録があると、本数と得点エントリが1対1で対応しない
    if (statHistory.some(s => s.sourceFoulId === entry.id && s.statType === 'FTA')) return false;

    const linkedFt = scoreHistory.filter(s => s.sourceFoulId === entry.id && s.scoreType === 'FT');
    // 旧データ（sourceFoulId を持たない）はここが 0 件になるので触らない
    if (linkedFt.length !== oldMade) return false;
    // OGにしたFTは、得点だけ残してシュート成績から外してある
    // （handleToggleOwnGoal）。成功数と得点エントリの本数が一致していても
    // シューターの freeThrowMade はそのぶん少ないので、差分を当てると
    // points と個々のスタッツの導出が食い違う（フューズが検出）
    if (linkedFt.some(s => s.isOwnGoal)) return false;
    // シューターを付け替えた記録は、得点が別の選手に付いている
    return !linkedFt.some(s => s.playerId !== entry.shooterPlayerId || s.teamId !== entry.shooterTeamId);
}

export function handleEditFoulFreeThrows(state: Game, payload: PayloadOf<'EDIT_FOUL_FREE_THROWS'>): Game {
    const { entryId, freeThrowResults } = payload;
    const entry = state.foulHistory.find(f => f.id === entryId);
    if (!entry) return state;

    const freeThrows = entry.freeThrows ?? 0;
    // 本数は変えない。UIは new Array(freeThrows) を全部埋めてから渡す
    if (freeThrowResults.length !== freeThrows) return state;
    if (!canEditFreeThrows(entry, state.scoreHistory, state.statHistory)) return state;

    const shooterTeamId = entry.shooterTeamId === 'teamA' ? 'teamA' : 'teamB';
    const oldResults = entry.freeThrowResults ?? [];
    const oldMade = oldResults.filter(r => r === 'made').length;
    const newMade = freeThrowResults.filter(r => r === 'made').length;
    const linkedFt = state.scoreHistory.filter(s => s.sourceFoulId === entry.id && s.scoreType === 'FT');

    const delta = newMade - oldMade;
    const sameOrder = oldResults.length === freeThrowResults.length
        && oldResults.every((r, i) => r === freeThrowResults[i]);
    if (sameOrder) return state;

    // 履歴と選手のファウル欄、両方の結果を書き換える。
    // 様式はFoulRecordのほうを読むので、片方だけ直すと画面とシートが食い違う
    const nextFoulHistory = state.foulHistory.map(f =>
        f.id === entryId ? { ...f, freeThrowResults: [...freeThrowResults] } : f);

    const updateFoulRecord = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget || !entry.playerId) return team;
        return {
            ...team,
            players: team.players.map(p => {
                if (p.id !== entry.playerId) return p;
                const index = findFoulIndex(p.fouls, state.foulHistory, entry);
                if (index === -1) return p;
                const cell = p.fouls[index];
                // 旧データはFoulType文字列で入っていてFTの情報を持たない。触らない
                if (typeof cell === 'string') return p;
                const fouls = [...p.fouls];
                fouls[index] = { ...cell, freeThrowResults: [...freeThrowResults] };
                return { ...p, fouls };
            }),
        };
    };

    // シューターの成功数と得点を差分で動かす（試投数は本数のままなので変わらない）
    const updateShooter = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget || delta === 0) return team;
        return {
            ...team,
            players: team.players.map(p => p.id === entry.shooterPlayerId
                ? {
                    ...p,
                    stats: {
                        ...p.stats,
                        freeThrowMade: p.stats.freeThrowMade + delta,
                        points: p.stats.points + delta,
                    },
                }
                : p),
        };
    };

    let nextScoreHistory = state.scoreHistory;
    if (delta < 0) {
        // 成功が減った。紐づく得点エントリを後ろから外す
        const removedIds = new Set(linkedFt.slice(delta).map(s => s.id));
        nextScoreHistory = nextScoreHistory.filter(s => !removedIds.has(s.id));
    } else if (delta > 0) {
        // 成功が増えた。記録時と同じ形（ファウル直後の連番時刻）で足す
        const shooterNumber = entry.shooterPlayerNumber
            ?? state[shooterTeamId].players.find(p => p.id === entry.shooterPlayerId)?.number
            ?? 0;
        const added: ScoreEntry[] = Array.from({ length: delta }, (_, i) => ({
            id: crypto.randomUUID(),
            teamId: entry.shooterTeamId!,
            playerId: entry.shooterPlayerId!,
            playerNumber: shooterNumber,
            scoreType: 'FT' as const,
            points: 1,
            quarter: entry.quarter,
            timestamp: entry.timestamp + 1 + oldMade + i,
            runningScoreA: 0,
            runningScoreB: 0,
            sourceFoulId: entry.id,
        }));
        nextScoreHistory = [...nextScoreHistory, ...added];
    }

    let teamA = updateFoulRecord(state.teamA, entry.teamId === 'teamA');
    let teamB = updateFoulRecord(state.teamB, entry.teamId === 'teamB');
    teamA = updateShooter(teamA, shooterTeamId === 'teamA');
    teamB = updateShooter(teamB, shooterTeamId === 'teamB');

    return {
        ...state,
        teamA,
        teamB,
        foulHistory: nextFoulHistory,
        // 足し引きで後続の累計がずれるため再計算（公式スコアシートの整合性維持）
        scoreHistory: recalculateRunningScores(nextScoreHistory),
    };
}

export function handleRemoveFoul(state: Game, payload: PayloadOf<'REMOVE_FOUL'>): Game {
    const { entryId } = payload;
    const entry = state.foulHistory.find(f => f.id === entryId);
    if (!entry) return state;

    // FT成功数を計算（FT関連のデータがある場合）
    const ftMade = entry.freeThrowResults?.filter(r => r === 'made').length || 0;
    const ftAttempts = entry.freeThrows || 0;

    // ファウルをしたチームを更新。
    // 記録側が複数の行へ書いたものは、ここで対にして消す。片方だけ消すと
    // 公式様式に取り消せないファウルが残る（A.コーチ・交代要員のBが実際にそうだった）。
    const updateFoulingTeam = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget) return team;

        // コーチ・A.コーチ・ベンチ関係者のファウル
        if (entry.isCoachOrBench) {
            if (entry.coachFoulTarget === 'COACH') {
                return { ...team, coachFouls: removeOneFoul(team.coachFouls, entry.foulType) };
            }
            if (entry.coachFoulTarget === 'ACOACH') {
                // 記録時にコーチ行へBを二重計上しているので対で消す
                return {
                    ...team,
                    assistantCoachFouls: removeOneFoul(team.assistantCoachFouls, entry.foulType),
                    coachFouls: removeOneFoul(team.coachFouls, 'BT'),
                };
            }
            // BENCH、または coachFoulTarget を持たない古いデータ。
            // ADD_FOUL 経由は benchFouls へ種別のまま、FT付きフロー経由は
            // コーチ行へ必ず 'BT' として、と記録先が分かれているため、
            // 実際に入っている方から消す。
            //
            // ここで「coachFouls から entry.foulType を消す」を挟んではいけない。
            // コーチ行には監督本人のT（表示「C」）とベンチ系のB（'BT'）が混ざる。
            // ベンチのファウルが種別 'T' で記録されていると、その一手が監督本人の
            // C を先に食い、ベンチの B は残る。以後そのBは coachFoulTarget が
            // 'BENCH' の履歴を消しても当たらず、様式に取り消せないマークが残る
            // （実測: coachFouls ['T','BT'] → ベンチを取り消して ['BT']）。
            // 記録側は最初の版から literal 'BT' しか書いていないので、この経路に
            // 拾うべき対象は元から無い。
            const benchRemoved = removeOneFoul(team.benchFouls, entry.foulType);
            if (benchRemoved !== team.benchFouls) {
                return { ...team, benchFouls: benchRemoved };
            }
            return { ...team, coachFouls: removeOneFoul(team.coachFouls, 'BT') };
        }

        const players = team.players.map(p => {
            if (p.id !== entry.playerId) return p;
            const foulIndex = findFoulIndex(p.fouls, state.foulHistory, entry);
            if (foulIndex === -1) return p;
            const fouls = [...p.fouls];
            fouls.splice(foulIndex, 1);
            return { ...p, fouls };
        });

        // 交代要員のテクニカルは記録時にチームファウルへ加算していない。
        // 代わりにコーチ行へBを二重計上しているので、そちらを対で消す
        if (isSubstituteTech(entry)) {
            return { ...team, players, coachFouls: removeOneFoul(team.coachFouls, 'BT') };
        }

        // 通常のプレイヤーファウルはチームファウルも減算。
        // OT欄は第4Qからの通算なので、後続の枠にも伝える（decrementTeamFoul）
        return { ...team, teamFouls: decrementTeamFoul(team.teamFouls, entry.quarter), players };
    };

    // バスケットカウント(and-1)の得点（削除時に戻すため）
    const basketPoints = entry.shotMade && entry.shotSituation && entry.shotSituation !== 'none'
        ? (entry.shotSituation === '3P' ? 3 : 2)
        : 0;

    // このファウルが生んだ「ミス」の記録（handleConvertScoreToMiss でFTAへ化けた分）。
    //
    // フリースローはファウル無しには発生しないので、ファウルを取り消すなら
    // 対で消えなければならない。紐付けを見ていなかったため、FTを「やっぱり
    // 外していた」と直したあとにファウルを取り消すと、シューターに原因の無い
    // 試投が残っていた（実測: ftm=0, fta=1）。
    // 自分で記録したFTミスは sourceFoulId を持たないので巻き込まない。
    const removedStatEntries = state.statHistory.filter(s => s.sourceFoulId === entry.id);

    // このファウルが生成した得点エントリ（FT成功分＋バスケットカウント）を特定する。
    // sourceFoulId を持つ新しいデータは確実に引ける。持たない旧データだけ、
    // 従来の「同じシューター・1秒以内」の推測にフォールバックする
    const removedScoreEntries: ScoreEntry[] = [];
    if (entry.shooterPlayerId && (ftMade > 0 || basketPoints > 0)) {
        const linked = state.scoreHistory.filter(s => s.sourceFoulId === entry.id);
        if (linked.length > 0) {
            removedScoreEntries.push(...linked);
        } else if (removedStatEntries.length === 0) {
            // 紐づく得点もミスも1件も無いときだけ推測に落ちる。
            //
            // 得点を「実は外していた」と直すと sourceFoulId ごと StatEntry へ移る
            // （scoreHandlers）。バスケットカウントのFTとシュートを両方直すと
            // linked は空になるが、これは新しい形式のデータであって旧データでは
            // ない。ここで推測へ落ちると、同じシューターが1秒以内に自力で決めた
            // 無関係な得点まで消えていた（実測: 自力の2Pが消えチーム得点 2→0）。
            const basketType = entry.shotSituation === '3P' ? '3P' : '2P';
            let removedFt = 0;
            let basketRemoved = basketPoints === 0; // バスケットが無ければ対象なし
            for (const s of state.scoreHistory) {
                if (s.sourceFoulId) continue; // 別のファウルに紐づく分は触らない
                const sameShooter =
                    s.playerId === entry.shooterPlayerId &&
                    s.teamId === entry.shooterTeamId &&
                    Math.abs(s.timestamp - entry.timestamp) < 1000; // 1秒以内
                if (!sameShooter) continue;
                if (s.scoreType === 'FT' && removedFt < ftMade) {
                    removedFt++;
                    removedScoreEntries.push(s);
                } else if (!basketRemoved && s.scoreType === basketType && s.points === basketPoints) {
                    basketRemoved = true;
                    removedScoreEntries.push(s);
                }
            }
        }
    }
    const removedScoreIds = new Set(removedScoreEntries.map(s => s.id));
    const newScoreHistory = removedScoreIds.size > 0
        ? state.scoreHistory.filter(s => !removedScoreIds.has(s.id))
        : state.scoreHistory;

    // 取り消した得点は、いま記録されている選手から戻す。
    // ファウルに控えたシューターを見て戻すと、履歴編集で得点を別の選手へ
    // 付け替えたあとに帳尻が合わなくなる（得点だけ残ってスタッツが減る）
    const reverseRemovedScores = (team: typeof state.teamA, teamId: 'teamA' | 'teamB') => {
        const targets = removedScoreEntries.filter(s => s.teamId === teamId);
        if (targets.length === 0) return team;
        return {
            ...team,
            players: team.players.map(p => {
                const mine = targets.filter(s => s.playerId === p.id);
                if (mine.length === 0) return p;
                const stats = { ...p.stats };
                for (const s of mine) {
                    stats.points -= s.points;
                    // OGはシュート成績に数えていない（handleToggleOwnGoal）ので戻す対象も無い。
                    // 無条件に引くと成功・試投が負になる。REMOVE_SCORE / EDIT_SCORE と同じ扱い
                    if (s.isOwnGoal) continue;
                    if (s.scoreType === '2P') { stats.twoPointMade--; stats.twoPointAttempt--; }
                    else if (s.scoreType === '3P') { stats.threePointMade--; stats.threePointAttempt--; }
                    else { stats.freeThrowMade--; stats.freeThrowAttempt--; }
                }
                return { ...p, stats };
            })
        };
    };

    const removedStatIds = new Set(removedStatEntries.map(s => s.id));
    const newStatHistory = removedStatIds.size > 0
        ? state.statHistory.filter(s => !removedStatIds.has(s.id))
        : state.statHistory;

    const reverseRemovedStats = (team: typeof state.teamA, teamId: 'teamA' | 'teamB') => {
        const targets = removedStatEntries.filter(s => s.teamId === teamId);
        if (targets.length === 0) return team;
        return {
            ...team,
            players: team.players.map(p => {
                const mine = targets.filter(s => s.playerId === p.id);
                if (mine.length === 0) return p;
                const stats = { ...p.stats };
                for (const s of mine) {
                    if (s.statType === '2PA') stats.twoPointAttempt--;
                    else if (s.statType === '3PA') stats.threePointAttempt--;
                    else if (s.statType === 'FTA') stats.freeThrowAttempt--;
                }
                return { ...p, stats };
            })
        };
    };

    // 外したFTは得点エントリを持たないため、本数だけシューターから戻す
    const missedFreeThrows = ftAttempts - ftMade;
    const reverseMissedFreeThrows = (team: typeof state.teamA, isTarget: boolean) => {
        if (!isTarget || !entry.shooterPlayerId || missedFreeThrows <= 0) return team;
        return {
            ...team,
            players: team.players.map(p => p.id === entry.shooterPlayerId
                ? { ...p, stats: { ...p.stats, freeThrowAttempt: p.stats.freeThrowAttempt - missedFreeThrows } }
                : p),
        };
    };

    // チーム更新（ファウル側）
    let newTeamA = updateFoulingTeam(state.teamA, entry.teamId === 'teamA');
    let newTeamB = updateFoulingTeam(state.teamB, entry.teamId === 'teamB');

    // チーム更新（得点側）
    newTeamA = reverseRemovedScores(newTeamA, 'teamA');
    newTeamB = reverseRemovedScores(newTeamB, 'teamB');
    newTeamA = reverseRemovedStats(newTeamA, 'teamA');
    newTeamB = reverseRemovedStats(newTeamB, 'teamB');
    newTeamA = reverseMissedFreeThrows(newTeamA, entry.shooterTeamId === 'teamA');
    newTeamB = reverseMissedFreeThrows(newTeamB, entry.shooterTeamId === 'teamB');

    return {
        ...state,
        teamA: newTeamA,
        teamB: newTeamB,
        // 得点エントリを削除すると後続の累計がずれるため再計算（公式スコアシートの整合性維持）
        scoreHistory: recalculateRunningScores(newScoreHistory),
        statHistory: newStatHistory,
        foulHistory: state.foulHistory.filter(f => f.id !== entryId),
    };
}
