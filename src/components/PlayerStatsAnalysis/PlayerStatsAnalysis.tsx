// 選手スタッツ分析 メインコンポーネント

import { useState, useMemo, useCallback } from 'react';
import type { SavedTeam } from '../../utils/teamStorage';
import {
    aggregatePlayerStats,
    getAvailableMyTeams,
    getTeamRecord,
    togglePlayerHidden,
    isPlayerHidden,
    loadHiddenPlayers,
    saveHiddenPlayers,
    type AggregatedPlayerStats,
    type TeamRecord,
} from '../../utils/playerStatsAnalysis';
import { startOfInputDateUtc, endOfInputDateUtc } from '../../utils/localDate';
import { useBackHandler } from '../../hooks/useBackHandler';
import { formatWinRate } from './winRate';
import { sortPlayers, PLAYER_SORT_OPTIONS, type PlayerSortKey } from './playerSort';
import { PlayerCardList } from './PlayerCardList';
import { DetailView } from './DetailView';
import type { ViewMode } from './types';
import {
    loadMergedPlayers,
    saveMergedPlayers,
    mergeKeys,
    unmergeKey,
    mergedCanonicalKeys,
    chooseCanonicalKey,
    carryOverHidden,
} from '../../utils/mergedPlayers';
import { findMergeCandidates } from './mergeCandidates';
import { ConfirmModal } from '../Modal';
import { formatPlayerNumber } from '../../utils/playerNumber';
import './PlayerStatsAnalysis.css';

interface PlayerStatsAnalysisProps {
    onBack: () => void;
}

/** 一覧が空になった理由（案内の文面を選ぶ） */
type EmptyReason = 'invalidRange' | 'period' | 'hidden' | 'noPlayerRecords' | 'noData';

function EmptyState({ reason, hiddenPlayerCount }: { reason: EmptyReason; hiddenPlayerCount: number }) {
    // 開始が終了より後。日付入力の min/max で普通は選べないが、直接入力や
    // 古い端末では通る。「この期間に試合がありません」と言うと、記録の有無の
    // 問題に見えて、範囲が逆さまだと気づけない
    if (reason === 'invalidRange') {
        return (
            <div className="empty-state">
                <div className="empty-icon">↔️</div>
                <h3>期間の開始と終了が逆になっています</h3>
                <p>開始日が終了日より後になっています。日付を入れ直すか、✕ で絞り込みを解除してください</p>
            </div>
        );
    }
    if (reason === 'period') {
        return (
            <div className="empty-state">
                <div className="empty-icon">📅</div>
                <h3>この期間に試合がありません</h3>
                <p>上の「データ表示期間」を変えるか、✕ で絞り込みを解除してください</p>
            </div>
        );
    }
    if (reason === 'hidden') {
        return (
            <div className="empty-state">
                <div className="empty-icon">🙈</div>
                <h3>表示できる選手がいません</h3>
                <p>{hiddenPlayerCount}人を選手スタッツ一覧に非表示にしています</p>
            </div>
        );
    }
    // 試合はあるのに集計対象の選手が1人もいない。
    // 「試合データがありません」と言うと、すぐ上のチームサマリーの試合数と
    // 矛盾したうえ、記録済みの利用者に「まだ記録していない」と案内してしまう
    if (reason === 'noPlayerRecords') {
        return (
            <div className="empty-state">
                <div className="empty-icon">🧍</div>
                <h3>選手の記録がありません</h3>
                <p>試合は記録されていますが、どの選手にもスタッツと出場クォーターが残っていません</p>
            </div>
        );
    }
    return (
        <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>試合データがありません</h3>
            <p>試合を記録すると選手スタッツが表示されます</p>
        </div>
    );
}

export function PlayerStatsAnalysis({ onBack }: PlayerStatsAnalysisProps) {
    // 初回マウント時のみチーム一覧を読み込む（遅延初期化）
    const [myTeams] = useState<SavedTeam[]>(() => getAvailableMyTeams());
    const [selectedTeam, setSelectedTeam] = useState<SavedTeam | null>(() => myTeams[0] ?? null);
    const [viewMode, setViewMode] = useState<ViewMode>('summary');
    const [selectedPlayer, setSelectedPlayer] = useState<AggregatedPlayerStats | null>(null);
    const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
    const [sortKey, setSortKey] = useState<PlayerSortKey>('number');
    const [showHiddenPlayers, setShowHiddenPlayers] = useState(false);
    const [hiddenPlayerCount, setHiddenPlayerCount] = useState(() =>
        myTeams[0] ? loadHiddenPlayers(myTeams[0].id).length : 0
    );
    const [hiddenToggleKey, setHiddenToggleKey] = useState(0);
    // 統合の変更を集計へ反映させるためのカウンタ（hiddenToggleKey と同じ役割）
    const [mergeToggleKey, setMergeToggleKey] = useState(0);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
    const [showMergeConfirm, setShowMergeConfirm] = useState(false);

    // 非表示選手数を更新（selectedTeam/viewModeの変化に応じたレンダー中の状態調整。
    // useEffectでのcascading render警告を避けるため）
    const [prevHiddenDeps, setPrevHiddenDeps] = useState<{ team: SavedTeam | null; view: ViewMode }>({ team: selectedTeam, view: viewMode });
    if (selectedTeam !== prevHiddenDeps.team || viewMode !== prevHiddenDeps.view) {
        setPrevHiddenDeps({ team: selectedTeam, view: viewMode });
        if (selectedTeam) {
            setHiddenPlayerCount(loadHiddenPlayers(selectedTeam.id).length);
        }
    }

    // 日付範囲はレンダーごとに新しいDateを生成しないようメモ化（useMemoの依存を安定させる）。
    // 記録がUTC0時で入っているので境界もUTCでそろえる（理由は localDate.ts）。
    // 以前は開始日がUTC・終了日が現地で食い違っていた
    const startDate = useMemo(() => startOfInputDateUtc(dateRange.start ?? ''), [dateRange.start]);
    const endDate = useMemo(() => endOfInputDateUtc(dateRange.end ?? ''), [dateRange.end]);

    const playerStats = useMemo(() => {
        if (!selectedTeam) return [];
        return aggregatePlayerStats(selectedTeam, startDate, endDate, { includeHidden: showHiddenPlayers });
        // hiddenToggleKey / mergeToggleKey: 非表示選手・統合の設定が変わった際に
        // 強制再計算するための意図的な依存
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, startDate, endDate, showHiddenPlayers, hiddenToggleKey, mergeToggleKey]);

    const teamRecord = useMemo((): TeamRecord | null => {
        if (!selectedTeam) return null;
        return getTeamRecord(selectedTeam, startDate, endDate);
    }, [selectedTeam, startDate, endDate]);

    const handleTeamChange = (teamId: string) => {
        const team = myTeams.find(t => t.id === teamId);
        if (team) {
            setSelectedTeam(team);
            setSelectedPlayer(null);
            setViewMode('summary');
            setShowHiddenPlayers(false);
            // 統合の選択状態もリセットする。playerKeyはチームIDを含まない
            // （氏名＋ライセンスNo.）ため、切り替え先に同姓同名（ライセンスNo.未入力）の
            // 選手がいると、リセットしないと選択済みのカードが乗り移って見える
            setSelectionMode(false);
            setSelectedKeys(new Set());
            setShowMergeConfirm(false);
        }
    };

    const handlePlayerClick = (player: AggregatedPlayerStats) => {
        setSelectedPlayer(player);
        setViewMode('detail');
    };

    const handleBackToSummary = useCallback(() => {
        setViewMode('summary');
        setSelectedPlayer(null);
    }, []);

    // 端末の戻る操作は詳細を閉じて一覧へ。ここを受け取らないと、画面上の
    // 「← 一覧」と挙動が食い違い、ホームまで飛ぶ（useBackHandler）
    useBackHandler(viewMode === 'detail', handleBackToSummary);

    // 集計が使っているキーをそのまま使う。氏名から組み直すと、同姓同名で
    // 背番号込みに分けたキー（buildPlayerKeys）と食い違い、片方を非表示に
    // したつもりで2人とも消える
    const handleTogglePlayerHidden = useCallback(() => {
        if (!selectedTeam || !selectedPlayer) return;
        togglePlayerHidden(selectedTeam.id, selectedPlayer.playerKey);
        setHiddenPlayerCount(loadHiddenPlayers(selectedTeam.id).length);
        setHiddenToggleKey(prev => prev + 1); // 再描画をトリガー
    }, [selectedTeam, selectedPlayer]);

    // 並べ替えは表示順だけを変える。集計（playerStats）には影響しないので分けて持つ
    const sortedPlayers = useMemo(() => sortPlayers(playerStats, sortKey), [playerStats, sortKey]);

    // 統合済みの代表キー（カードの印に使う）
    const mergedKeys = useMemo(() => {
        if (!selectedTeam) return new Set<string>();
        return mergedCanonicalKeys(loadMergedPlayers(selectedTeam.id));
        // mergeToggleKey: 統合の切り替えを取り込むための意図的な依存
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, mergeToggleKey]);

    // 割れていそうな組。提案するだけで、確認なしには統合しない
    const mergeCandidates = useMemo(
        () => findMergeCandidates(playerStats, selectedTeam?.players.map(p => p.name) ?? []),
        [playerStats, selectedTeam],
    );

    // 選択の枚数を数えるとき、selectedKeys ではなく必ずこちらを見る。
    // selectedKeys は「押されたキーの集合」であって、期間の絞り込みや
    // 非表示トグルで playerStats から消えたキーもそのまま残り続ける。
    // ツールバーの枚数表示やボタンの disabled を selectedKeys.size で
    // 判定すると、絞り込みで1枚だけ一覧から消えた直後も「2枚選択中」の
    // ままボタンが押せてしまい、確認モーダルの文面と実際にまとめる枚数が
    // ずれる（実際に統合するのも常にこの selectedCards）。
    // selectedKeys 自体はあえて生の集合のまま保持する。絞り込みを戻せば
    // 選び直さずに済むため
    const selectedCards = useMemo(
        () => playerStats.filter(p => selectedKeys.has(p.playerKey)),
        [playerStats, selectedKeys],
    );

    // 代表は名簿に載っている側。詳細は mergedPlayers の chooseCanonicalKey
    const canonicalKey = useMemo(
        () => chooseCanonicalKey(
            selectedCards.map(p => ({
                playerKey: p.playerKey,
                name: p.name,
                latestDate: p.gameHistory[0]?.date ?? '',
            })),
            selectedTeam?.players.map(p => p.name) ?? [],
        ),
        [selectedCards, selectedTeam],
    );

    const canonicalCard = selectedCards.find(p => p.playerKey === canonicalKey) ?? null;
    const mergedGames = selectedCards.reduce((sum, p) => sum + p.gamesPlayed, 0);

    const handleToggleSelect = useCallback((playerKey: string) => {
        setSelectedKeys(prev => {
            const next = new Set(prev);
            if (next.has(playerKey)) next.delete(playerKey);
            else next.add(playerKey);
            return next;
        });
    }, []);

    const exitSelection = useCallback(() => {
        setSelectionMode(false);
        setSelectedKeys(new Set());
        setShowMergeConfirm(false);
    }, []);

    // 端末の戻る操作は選択モードを抜けるだけにする。
    //
    // 選択モードは画面の中の一段で、抜ける手段（「やめる」）も画面にある。
    // ここを受け取らないと、統合する相手を何枚か選んだ状態でエッジスワイプした
    // 瞬間に、選択ごとホームまで飛ぶ（実測）。このアプリはサブ状態すべてを
    // useBackHandler で受けている——詳細ビュー・名簿の編集フォーム・スコアシート・
    // スタメン選択・ファウルフローの各ステップ・得点セレクタ——ので、ここだけ
    // 例外にする理由がない。
    //
    // 確認モーダルはあとからマウントされる＝スタックの上に載るので、
    // 開いている間はモーダルが先に閉じる（modalStack の LIFO）。
    useBackHandler(selectionMode, exitSelection);

    const handleMerge = useCallback(() => {
        if (!selectedTeam || selectedCards.length < 2 || !canonicalKey) {
            // ここへ来るのは主に、確認モーダルを開いたあとに期間の絞り込みなどで
            // selectedCards が2枚未満へ減った場合。押しても無反応のままモーダルが
            // 残ると抜け出す手段が「やめる」しか無くなるため、保険として閉じる
            setShowMergeConfirm(false);
            return;
        }
        const keys = selectedCards.map(p => p.playerKey);
        saveMergedPlayers(selectedTeam.id, mergeKeys(loadMergedPlayers(selectedTeam.id), keys, canonicalKey));
        // 統合するとキーが変わる。引き継がないと、非表示にしていた選手が
        // 統合した瞬間に一覧へ復活したように見える
        saveHiddenPlayers(selectedTeam.id, carryOverHidden(loadHiddenPlayers(selectedTeam.id), keys, canonicalKey));
        setHiddenPlayerCount(loadHiddenPlayers(selectedTeam.id).length);
        setMergeToggleKey(prev => prev + 1);
        setHiddenToggleKey(prev => prev + 1);
        exitSelection();
    }, [selectedTeam, selectedCards, canonicalKey, exitSelection]);

    const handleUnmerge = useCallback(() => {
        if (!selectedTeam || !selectedPlayer) return;
        saveMergedPlayers(
            selectedTeam.id,
            unmergeKey(loadMergedPlayers(selectedTeam.id), selectedPlayer.playerKey),
        );
        setMergeToggleKey(prev => prev + 1);
        // 解除すると元の枚数に戻る。開いていた詳細はもう同じ内容ではないので一覧へ
        handleBackToSummary();
    }, [selectedTeam, selectedPlayer, handleBackToSummary]);

    // 非表示にしている選手のキー。全員表示に切り替えたとき、どれが非表示なのかを
    // カードに示すために使う。印が無いと、戻したい選手を1人ずつ詳細で確かめるしかない
    const hiddenPlayerKeys = useMemo(() => {
        if (!selectedTeam) return new Set<string>();
        return new Set(loadHiddenPlayers(selectedTeam.id));
        // hiddenToggleKey: 詳細画面での切り替えを取り込むための意図的な依存
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, hiddenToggleKey]);

    const hasDateFilter = !!(dateRange.start || dateRange.end);
    // 開始が終了より後。両方入っているときだけ判定する（片方だけなら片側の絞り込み）
    const isRangeInverted = !!(dateRange.start && dateRange.end && dateRange.start > dateRange.end);

    // 一覧が空になった理由。案内の文面と、抜け出すための操作子が変わる。
    // 「試合が無い」と「絞り込みで消えた」を混同すると、事実と違う案内をしたうえに
    // 元に戻す手掛かりも出せない。
    const emptyReason: EmptyReason | null = useMemo(() => {
        if (playerStats.length > 0) return null;
        // 範囲が逆さまなら必ず0件になる。試合の有無より先に理由として出す
        if (isRangeInverted) return 'invalidRange';
        if (hasDateFilter && (teamRecord?.totalGames ?? 0) === 0) return 'period';
        // 全員表示にしているなら、非表示は0件の理由になっていない。
        // ここを見ずに hiddenPlayerCount だけで決めていたため、トグルをONにしても
        // 「N人を非表示にしています」と事実と違う案内を出し続けていた
        // （名簿から消えた選手の設定だけが残っている場合などに起きる）
        if (!showHiddenPlayers && hiddenPlayerCount > 0) return 'hidden';
        // 試合はあるのに集計できる選手がいない（保留のまま保存した、スタメンを
        // 確定しないまま記録した等）。「試合データがありません」と言うと、
        // すぐ上のチームサマリーが出している試合数と食い違う
        if ((teamRecord?.totalGames ?? 0) > 0) return 'noPlayerRecords';
        return 'noData';
    }, [playerStats.length, isRangeInverted, hasDateFilter, teamRecord, hiddenPlayerCount, showHiddenPlayers]);

    const isSelectedPlayerHidden = useMemo(() => {
        if (!selectedTeam || !selectedPlayer) return false;
        return isPlayerHidden(selectedTeam.id, selectedPlayer.playerKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, selectedPlayer, hiddenToggleKey]);

    if (myTeams.length === 0) {
        return (
            <main className="player-stats-container">
                <div className="player-stats-header">
                    <button className="btn-back" onClick={onBack}>
                        <span className="back-icon">←</span>
                        <span>ホーム</span>
                    </button>
                    <h1>📊 選手スタッツ分析</h1>
                </div>
                <div className="empty-state">
                    <div className="empty-icon">🏀</div>
                    <h3>マイチームが登録されていません</h3>
                    <p>先にマイチームを登録してください</p>
                </div>
            </main>
        );
    }

    return (
        <main className="player-stats-container">
            <div className="player-stats-header">
                <button className="btn-back" onClick={viewMode === 'summary' ? onBack : handleBackToSummary}>
                    <span className="back-icon">←</span>
                    <span>{viewMode === 'summary' ? 'ホーム' : '一覧'}</span>
                </button>
                {viewMode === 'summary' && <h1>📊 選手スタッツ分析</h1>}
            </div>

            {viewMode === 'summary' && (
                <>
                    {/*
                      絞り込みの操作子は集計が0件でも必ず描画する。
                      条件を変える手段が消えると、その条件から抜け出せなくなる
                      （期間・非表示選手のどちらでも起きた）。
                    */}
                    {/* 割れているカードは利用者が気づかないと直しようがない。
                        案内は提案だけで、確認なしには統合しない */}
                    {!selectionMode && mergeCandidates.length > 0 && (
                        <div className="merge-hint">
                            <span className="merge-hint-text">
                                同じ選手が分かれているかもしれません（{mergeCandidates.length}組）
                            </span>
                            <button
                                className="btn btn-secondary btn-small"
                                onClick={() => {
                                    setSelectionMode(true);
                                    setSelectedKeys(new Set(mergeCandidates[0].map(p => p.playerKey)));
                                }}
                            >
                                確認する
                            </button>
                        </div>
                    )}

                    <div className="merge-toolbar">
                        {selectionMode ? (
                            <>
                                <span className="merge-toolbar-text">
                                    同じ選手のカードを2枚以上選んでください（{selectedCards.length}枚選択中）
                                </span>
                                <button
                                    className="btn btn-primary btn-small"
                                    disabled={selectedCards.length < 2}
                                    onClick={() => setShowMergeConfirm(true)}
                                >
                                    統合する
                                </button>
                                <button className="btn btn-secondary btn-small" onClick={exitSelection}>
                                    やめる
                                </button>
                            </>
                        ) : (
                            // 統合すると2枚が1枚になる。1枚しか無ければ統合する
                            // 相手が居ないので、入口のボタンごと消えるのが正しい
                            playerStats.length >= 2 && (
                                <button
                                    className="btn btn-secondary btn-small"
                                    onClick={() => setSelectionMode(true)}
                                >
                                    選手を統合
                                </button>
                            )
                        )}
                    </div>

                    <div className="controls-bar">
                        <div className="field-group">
                            <label className="field-label" htmlFor="stats-team-select">マイチーム選択：</label>
                            <select
                                id="stats-team-select"
                                value={selectedTeam?.id || ''}
                                onChange={e => handleTeamChange(e.target.value)}
                                className="team-select"
                            >
                                {myTeams.map(team => (
                                    <option key={team.id} value={team.id}>{team.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="field-group">
                            <label className="field-label" htmlFor="stats-sort-select">並び順：</label>
                            <select
                                id="stats-sort-select"
                                value={sortKey}
                                onChange={e => setSortKey(e.target.value as PlayerSortKey)}
                                className="team-select sort-select"
                            >
                                {PLAYER_SORT_OPTIONS.map(option => (
                                    <option key={option.key} value={option.key}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="field-group">
                            <label className="field-label" htmlFor="stats-date-start">データ表示期間：</label>
                            {/*
                              相手側の日付を境にして、逆さまな範囲をそもそも選べなくする。
                              入れられてしまうと必ず0件になり、「この期間に試合がありません」
                              としか出ないので、範囲の向きが原因だと気づけない。
                              直接入力で通ってしまう端末向けに、案内側でも invalidRange を出す
                            */}
                            <div className={`date-range ${isRangeInverted ? 'invalid' : ''}`}>
                            <input
                                id="stats-date-start"
                                type="date"
                                aria-label="データ表示期間の開始日"
                                max={dateRange.end || undefined}
                                value={dateRange.start || ''}
                                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <span className="date-separator">〜</span>
                            <input
                                type="date"
                                aria-label="データ表示期間の終了日"
                                min={dateRange.start || undefined}
                                value={dateRange.end || ''}
                                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            />
                            {hasDateFilter && (
                                <button
                                    className="btn-reset"
                                    onClick={() => setDateRange({})}
                                    aria-label="期間の絞り込みを解除"
                                >
                                    ✕
                                </button>
                            )}
                            </div>
                        </div>
                    </div>

                    {teamRecord && teamRecord.totalGames > 0 && (
                        <div className="team-summary-card">
                            <div className="team-name">{selectedTeam?.name}</div>
                            <div className="team-record">
                                <div className="record-stat total">
                                    <span className="value">{teamRecord.totalGames}</span>
                                    <span className="label">試合</span>
                                </div>
                                <div className="record-stat win">
                                    <span className="value">{teamRecord.wins}</span>
                                    <span className="label">勝</span>
                                </div>
                                <div className="record-stat loss">
                                    <span className="value">{teamRecord.losses}</span>
                                    <span className="label">敗</span>
                                </div>
                                {teamRecord.draws > 0 && (
                                    <div className="record-stat draw">
                                        <span className="value">{teamRecord.draws}</span>
                                        <span className="label">分</span>
                                    </div>
                                )}
                                <div className="record-stat rate">
                                    {/* 引き分けは分母に入れない。理由は winRate.ts */}
                                    <span className="value">{formatWinRate(teamRecord)}</span>
                                    <span className="label">勝率</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {emptyReason === null
                        ? <PlayerCardList
                            players={sortedPlayers}
                            hiddenPlayerKeys={hiddenPlayerKeys}
                            onPlayerClick={handlePlayerClick}
                            selectionMode={selectionMode}
                            selectedKeys={selectedKeys}
                            onToggleSelect={handleToggleSelect}
                            mergedKeys={mergedKeys}
                        />
                        : <EmptyState reason={emptyReason} hiddenPlayerCount={hiddenPlayerCount} />}

                    {hiddenPlayerCount > 0 && (
                        <label className={`hidden-players-toggle ${showHiddenPlayers ? 'active' : ''}`}>
                            <span className="toggle-label">
                                {showHiddenPlayers ? '全選手表示中' : `非表示選手 (${hiddenPlayerCount}人)`}
                            </span>
                            <input
                                type="checkbox"
                                checked={showHiddenPlayers}
                                onChange={e => setShowHiddenPlayers(e.target.checked)}
                                aria-label="非表示にした選手も一覧に表示する"
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    )}
                </>
            )}

            {viewMode === 'detail' && selectedPlayer && selectedTeam && (
                <DetailView
                    player={selectedPlayer}
                    teamId={selectedTeam.id}
                    isHidden={isSelectedPlayerHidden}
                    onToggleHidden={handleTogglePlayerHidden}
                    isMerged={mergedKeys.has(selectedPlayer.playerKey)}
                    onUnmerge={handleUnmerge}
                />
            )}

            {showMergeConfirm && canonicalCard && (
                <ConfirmModal
                    title="選手を統合しますか？"
                    message={`${selectedCards.length}枚のカードを1人としてまとめます。まとめたあとは #${formatPlayerNumber(canonicalCard.number)} ${canonicalCard.name}（合計${mergedGames}試合）として表示されます。`}
                    note="試合の記録は変わりません。あとから解除できます。"
                    confirmLabel="この内容で統合"
                    cancelLabel="やめる"
                    onConfirm={handleMerge}
                    onCancel={() => setShowMergeConfirm(false)}
                />
            )}
        </main>
    );
}
