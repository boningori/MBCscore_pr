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
import './PlayerStatsAnalysis.css';

interface PlayerStatsAnalysisProps {
    onBack: () => void;
}

/** 一覧が空になった理由（案内の文面を選ぶ） */
type EmptyReason = 'period' | 'hidden' | 'noPlayerRecords' | 'noData';

function EmptyState({ reason, hiddenPlayerCount }: { reason: EmptyReason; hiddenPlayerCount: number }) {
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
        // hiddenToggleKey: 非表示選手の集合が変わった際に強制再計算するための意図的な依存
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, startDate, endDate, showHiddenPlayers, hiddenToggleKey]);

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

    const hasDateFilter = !!(dateRange.start || dateRange.end);

    // 一覧が空になった理由。案内の文面と、抜け出すための操作子が変わる。
    // 「試合が無い」と「絞り込みで消えた」を混同すると、事実と違う案内をしたうえに
    // 元に戻す手掛かりも出せない。
    const emptyReason: EmptyReason | null = useMemo(() => {
        if (playerStats.length > 0) return null;
        if (hasDateFilter && (teamRecord?.totalGames ?? 0) === 0) return 'period';
        if (hiddenPlayerCount > 0) return 'hidden';
        // 試合はあるのに集計できる選手がいない（保留のまま保存した、スタメンを
        // 確定しないまま記録した等）。「試合データがありません」と言うと、
        // すぐ上のチームサマリーが出している試合数と食い違う
        if ((teamRecord?.totalGames ?? 0) > 0) return 'noPlayerRecords';
        return 'noData';
    }, [playerStats.length, hasDateFilter, teamRecord, hiddenPlayerCount]);

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
                            <div className="date-range">
                            <input
                                id="stats-date-start"
                                type="date"
                                aria-label="データ表示期間の開始日"
                                value={dateRange.start || ''}
                                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <span className="date-separator">〜</span>
                            <input
                                type="date"
                                aria-label="データ表示期間の終了日"
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
                        ? <PlayerCardList players={sortedPlayers} onPlayerClick={handlePlayerClick} />
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
                />
            )}
        </main>
    );
}
