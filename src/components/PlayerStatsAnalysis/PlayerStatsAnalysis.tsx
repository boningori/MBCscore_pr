// 選手スタッツ分析 メインコンポーネント

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { SavedTeam } from '../../utils/teamStorage';
import {
    aggregatePlayerStats,
    getAvailableMyTeams,
    getTeamRecord,
    generatePlayerKey,
    togglePlayerHidden,
    isPlayerHidden,
    loadHiddenPlayers,
    type AggregatedPlayerStats,
    type TeamRecord,
} from '../../utils/playerStatsAnalysis';
import { PlayerCardList } from './PlayerCardList';
import { DetailView } from './DetailView';
import type { ViewMode } from './types';
import './PlayerStatsAnalysis.css';

interface PlayerStatsAnalysisProps {
    onBack: () => void;
}

export function PlayerStatsAnalysis({ onBack }: PlayerStatsAnalysisProps) {
    const [myTeams, setMyTeams] = useState<SavedTeam[]>([]);
    const [selectedTeam, setSelectedTeam] = useState<SavedTeam | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('summary');
    const [selectedPlayer, setSelectedPlayer] = useState<AggregatedPlayerStats | null>(null);
    const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
    const [showHiddenPlayers, setShowHiddenPlayers] = useState(false);
    const [hiddenPlayerCount, setHiddenPlayerCount] = useState(0);
    const [hiddenToggleKey, setHiddenToggleKey] = useState(0);

    useEffect(() => {
        const teams = getAvailableMyTeams();
        setMyTeams(teams);
        if (teams.length > 0) {
            setSelectedTeam(teams[0]);
        }
    }, []);

    // 非表示選手数を更新
    useEffect(() => {
        if (selectedTeam) {
            setHiddenPlayerCount(loadHiddenPlayers(selectedTeam.id).length);
        }
    }, [selectedTeam, viewMode]);

    const startDate = dateRange.start ? new Date(dateRange.start) : undefined;
    const endDate = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : undefined;

    const playerStats = useMemo(() => {
        if (!selectedTeam) return [];
        return aggregatePlayerStats(selectedTeam, startDate, endDate, { includeHidden: showHiddenPlayers });
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

    const handleBackToSummary = () => {
        setViewMode('summary');
        setSelectedPlayer(null);
    };

    const handleTogglePlayerHidden = useCallback(() => {
        if (!selectedTeam || !selectedPlayer) return;
        const playerKey = generatePlayerKey(selectedPlayer.name, selectedPlayer.licenseNo);
        togglePlayerHidden(selectedTeam.id, playerKey);
        setHiddenPlayerCount(loadHiddenPlayers(selectedTeam.id).length);
        setHiddenToggleKey(prev => prev + 1); // 再描画をトリガー
    }, [selectedTeam, selectedPlayer]);

    const isSelectedPlayerHidden = useMemo(() => {
        if (!selectedTeam || !selectedPlayer) return false;
        const playerKey = generatePlayerKey(selectedPlayer.name, selectedPlayer.licenseNo);
        return isPlayerHidden(selectedTeam.id, playerKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTeam, selectedPlayer, hiddenToggleKey]);

    if (myTeams.length === 0) {
        return (
            <div className="player-stats-container">
                <div className="player-stats-header">
                    <button className="btn-back" onClick={onBack}>
                        <span className="back-icon">←</span>
                        <span>ホーム</span>
                    </button>
                    <h2>📊 選手スタッツ分析</h2>
                </div>
                <div className="empty-state">
                    <div className="empty-icon">🏀</div>
                    <h3>マイチームが登録されていません</h3>
                    <p>先にマイチームを登録してください</p>
                </div>
            </div>
        );
    }

    if (playerStats.length === 0 && viewMode === 'summary') {
        return (
            <div className="player-stats-container">
                <div className="player-stats-header">
                    <button className="btn-back" onClick={onBack}>
                        <span className="back-icon">←</span>
                        <span>ホーム</span>
                    </button>
                    <h2>📊 選手スタッツ分析</h2>
                </div>
                <div className="controls-bar">
                    <select
                        value={selectedTeam?.id || ''}
                        onChange={e => handleTeamChange(e.target.value)}
                        className="team-select"
                    >
                        {myTeams.map(team => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                    </select>
                </div>
                <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <h3>試合データがありません</h3>
                    <p>試合を記録すると選手スタッツが表示されます</p>
                </div>
            </div>
        );
    }

    return (
        <div className="player-stats-container">
            <div className="player-stats-header">
                <button className="btn-back" onClick={viewMode === 'summary' ? onBack : handleBackToSummary}>
                    <span className="back-icon">←</span>
                    <span>{viewMode === 'summary' ? 'ホーム' : '一覧'}</span>
                </button>
                {viewMode === 'summary' && <h2>📊 選手スタッツ分析</h2>}
            </div>

            {viewMode === 'summary' && (
                <>
                    <div className="controls-bar">
                        <select
                            value={selectedTeam?.id || ''}
                            onChange={e => handleTeamChange(e.target.value)}
                            className="team-select"
                        >
                            {myTeams.map(team => (
                                <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                        </select>

                        <div className="date-range">
                            <input
                                type="date"
                                value={dateRange.start || ''}
                                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            />
                            <span className="date-separator">〜</span>
                            <input
                                type="date"
                                value={dateRange.end || ''}
                                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            />
                            {(dateRange.start || dateRange.end) && (
                                <button
                                    className="btn-reset"
                                    onClick={() => setDateRange({})}
                                >
                                    ✕
                                </button>
                            )}
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
                                    <span className="value">
                                        {((teamRecord.wins / teamRecord.totalGames) * 100).toFixed(0)}%
                                    </span>
                                    <span className="label">勝率</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <PlayerCardList players={playerStats} onPlayerClick={handlePlayerClick} />

                    {hiddenPlayerCount > 0 && (
                        <label className="hidden-toggle">
                            <input
                                type="checkbox"
                                checked={showHiddenPlayers}
                                onChange={e => setShowHiddenPlayers(e.target.checked)}
                            />
                            <span>非表示選手を含める ({hiddenPlayerCount}人)</span>
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
        </div>
    );
}
