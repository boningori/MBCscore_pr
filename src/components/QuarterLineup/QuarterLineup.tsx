import { useState } from 'react';
import type { Player } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import './QuarterLineup.css';

interface QuarterLineupProps {
    quarter: number;
    teamName: string;
    players: Player[];
    onConfirm: (startingPlayerIds: string[]) => void;
    onBack?: () => void;
}

export function QuarterLineup({
    quarter,
    teamName,
    players,
    onConfirm,
    onBack,
}: QuarterLineupProps) {
    const computeInitialSelected = () =>
        players
            .filter(p => p.isOnCourt && p.fouls.length < 5)
            .map(p => p.id);

    const [selectedIds, setSelectedIds] = useState<string[]>(computeInitialSelected);

    // チームまたはクォーターが変わったら選択をリセット
    // （レンダー中の状態調整。useEffectでのcascading render警告を避けるため）
    const [prevLineupKey, setPrevLineupKey] = useState({ teamName, quarter });
    if (teamName !== prevLineupKey.teamName || quarter !== prevLineupKey.quarter) {
        setPrevLineupKey({ teamName, quarter });
        setSelectedIds(computeInitialSelected());
    }

    // 出場可能な選手（5ファウル退場していない）
    const availablePlayers = players.filter(p => p.fouls.length < 5);

    // 前クォーター出場者
    const previousQuarterPlayers = players.filter(
        p => !!p.quartersPlayed[quarter - 2] && quarter > 1
    );

    // ミニバス出場ルールの「目安」（Q1〜Q4が対象・非強制）
    const isRegularQuarter = quarter <= 4;
    // 各選手がこれまでに出場した通常クォーター数（OTは除外）
    const regularQuartersPlayed = (p: Player) =>
        p.quartersPlayed.slice(0, 4).filter(Boolean).length;
    // 全員出場の目安: まだ1度も出場していない選手（背番号）
    const unplayedNumbers = players
        .filter(p => regularQuartersPlayed(p) === 0)
        .map(p => p.number);

    const handlePlayerToggle = (playerId: string) => {
        if (selectedIds.includes(playerId)) {
            setSelectedIds(selectedIds.filter(id => id !== playerId));
        } else if (selectedIds.length < PLAYERS_ON_COURT) {
            setSelectedIds([...selectedIds, playerId]);
        }
    };

    const handleConfirm = () => {
        if (selectedIds.length === PLAYERS_ON_COURT) {
            onConfirm(selectedIds);
        }
    };

    const isValid = selectedIds.length === PLAYERS_ON_COURT;

    // クォーター色（1Q/3Qは赤、2Q/4Q/OTは黒）
    const isOT = quarter > 4;
    const quarterClass = isOT ? 'q-even' : (quarter === 1 || quarter === 3 ? 'q-odd' : 'q-even');
    const quarterLabel = isOT
        ? (quarter === 5 ? 'OT' : `OT${quarter - 4}`)
        : `Q${quarter}`;

    return (
        <div className="quarter-lineup">
            <div className="quarter-lineup-header">
                {onBack && (
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← 戻る
                    </button>
                )}
                <div className={`quarter-badge ${quarterClass}`}>
                    {quarterLabel}
                </div>
                <h2>{teamName} スタメン選択</h2>
            </div>

            <div className="lineup-status">
                <span className={selectedIds.length === PLAYERS_ON_COURT ? 'complete' : 'incomplete'}>
                    {selectedIds.length} / {PLAYERS_ON_COURT} 名選択
                </span>
            </div>

            {quarter > 1 && previousQuarterPlayers.length > 0 && (
                <div className="previous-quarter-info">
                    <span className="text-muted">前Q出場: </span>
                    {previousQuarterPlayers.map(p => `#${p.number}`).join(', ')}
                </div>
            )}

            <div className="player-selection-grid">
                {availablePlayers.map(player => {
                    const isSelected = selectedIds.includes(player.id);
                    const wasOnCourt = player.isOnCourt;

                    // 出場ルールの目安（非強制の警告表示）
                    const rq = regularQuartersPlayed(player);
                    const projected = rq + (isSelected && isRegularQuarter ? 1 : 0);
                    // このQに出すと4Q目になる（最大3Q超過）
                    const overMax = isRegularQuarter && projected > 3;
                    // 残りの通常クォーターを全て出ても2Qに届かない（最低2Q未達）
                    const potentialMax = rq + (isRegularQuarter ? 5 - quarter : 0);
                    const cannotReachMin = isRegularQuarter && potentialMax < 2;

                    return (
                        <div
                            key={player.id}
                            className={`lineup-player-card ${isSelected ? 'selected' : ''} ${wasOnCourt ? 'was-on-court' : ''} ${overMax ? 'rule-over-max' : ''}`}
                            onClick={() => handlePlayerToggle(player.id)}
                        >
                            <div className="lineup-player-number">#{player.number}</div>
                            <div className="lineup-player-name">
                                {player.name}
                                {player.isCaptain && <span className="captain-badge">C</span>}
                            </div>
                            <div className="lineup-player-stats">
                                <span className="stat-points">{player.stats.points}pts</span>
                                {player.fouls.length > 0 && (
                                    <span className={`stat-fouls ${player.fouls.length >= 4 ? 'warning' : ''}`}>
                                        F{player.fouls.length}
                                    </span>
                                )}
                            </div>
                            <div className="lineup-player-quarters">
                                {player.quartersPlayed.map((played, i) => {
                                    const q = i + 1;
                                    const label = q <= 4 ? `${q}` : (q === 5 ? 'OT' : `OT${q - 4}`);
                                    return (
                                        <span
                                            key={q}
                                            className={`quarter-dot ${played ? 'played' : ''} ${q === quarter ? 'current' : ''}`}
                                        >
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                            {(overMax || cannotReachMin) && (
                                <div className="lineup-rule-chips">
                                    {overMax && <span className="lineup-rule-chip over-max">3Q超</span>}
                                    {cannotReachMin && <span className="lineup-rule-chip min-risk">2Q未達</span>}
                                </div>
                            )}
                            {isSelected && <div className="selection-check">✓</div>}
                        </div>
                    );
                })}
            </div>

            <div className="quarter-lineup-actions">
                <button
                    className="btn btn-success btn-large"
                    onClick={handleConfirm}
                    disabled={!isValid}
                >
                    {quarter === 1 ? '試合開始' : `${quarterLabel} 開始`}
                </button>
            </div>

            <div className="quarter-rule-hint">
                {isRegularQuarter && quarter >= 2 && unplayedNumbers.length > 0 && (
                    <p className="rule-warn">
                        ⚠ 未出場（全員出場の目安）: {unplayedNumbers.map(n => `#${n}`).join(', ')}
                    </p>
                )}
                <p className="text-muted text-sm">
                    ※ ミニバスの目安: 各選手 最低2Q・最大3Q・全員出場（強制ではありません）
                </p>
            </div>
        </div>
    );
}
