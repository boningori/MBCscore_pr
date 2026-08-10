import type { Player } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { getDisqualification, shortDisqualificationLabel } from '../../utils/disqualification';

interface LineupTeamPanelProps {
    quarter: number;
    players: Player[];
    selectedIds: string[];
    onToggle: (playerId: string) => void;
}

/** 1チーム分のスタメン選択パネル。状態を持たない表示専用コンポーネント */
export function LineupTeamPanel({ quarter, players, selectedIds, onToggle }: LineupTeamPanelProps) {
    // 5ファウルの選手も一覧に残し、選択も妨げない。
    // 練習試合では相手チームの同意のうえで退場者が出続けることがあり、除外すると
    // コートに戻す手段がなくなる。人数の少ない編成では残り5名を割って
    // 「開始」が永久に押せなくなる（実測: 6人編成で2名退場すると4/5で固定）。
    // このファイル下部の「最低2Q・最大3Q」と同じく、退場も表示で伝えて判断は任せる。
    // 既定の選択からは外す（QuarterLineupのinitialSelection）ので、
    // 公式戦では手を加えなければ正しい運用になる。

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

    return (
        <>
            <div className="lineup-status">
                <span className={selectedIds.length === PLAYERS_ON_COURT ? 'complete' : 'incomplete'}>
                    {selectedIds.length} / {PLAYERS_ON_COURT} 名選択
                </span>
            </div>

            {quarter > 1 && previousQuarterPlayers.length > 0 && (
                <div className="previous-quarter-info">
                    <span className="text-muted">前Q出場: </span>
                    {previousQuarterPlayers.map(p => `#${formatPlayerNumber(p.number)}`).join(', ')}
                </div>
            )}

            <div className="player-selection-grid">
                {players.map(player => {
                    const isSelected = selectedIds.includes(player.id);
                    const wasOnCourt = player.isOnCourt;
                    // 5ファウルだけでなく D / U・T 2回の失格も見る（詳細は disqualification.ts）
                    const disqualification = getDisqualification(player.fouls);
                    const fouledOut = disqualification !== null;

                    // 出場ルールの目安（非強制の警告表示）
                    const rq = regularQuartersPlayed(player);
                    const projected = rq + (isSelected && isRegularQuarter ? 1 : 0);
                    // このQに出すと4Q目になる（最大3Q超過）
                    const overMax = isRegularQuarter && projected > 3;
                    // 残りの通常クォーターを全て出ても2Qに届かない（最低2Q未達）
                    const potentialMax = rq + (isRegularQuarter ? 5 - quarter : 0);
                    const cannotReachMin = isRegularQuarter && potentialMax < 2;

                    return (
                        <button
                            type="button"
                            key={player.id}
                            className={`lineup-player-card ${isSelected ? 'selected' : ''} ${wasOnCourt ? 'was-on-court' : ''} ${overMax ? 'rule-over-max' : ''} ${fouledOut ? 'fouled-out' : ''}`}
                            onClick={() => onToggle(player.id)}
                            aria-pressed={isSelected}
                        >
                            <div className="lineup-player-number">#{formatPlayerNumber(player.number)}</div>
                            <div className="lineup-player-name">
                                {player.name}
                                {player.isCaptain && <span className="captain-badge">C</span>}
                            </div>
                            <div className="lineup-player-stats">
                                <span className="stat-points">{player.stats.points}pts</span>
                                {player.fouls.length > 0 && (
                                    <span className={`stat-fouls ${fouledOut ? 'fouled-out' : player.fouls.length >= 4 ? 'warning' : ''}`}>
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
                            {(fouledOut || overMax || cannotReachMin) && (
                                <div className="lineup-rule-chips">
                                    {disqualification && (
                                        <span className="lineup-rule-chip fouled-out">
                                            {shortDisqualificationLabel(disqualification)}
                                        </span>
                                    )}
                                    {overMax && <span className="lineup-rule-chip over-max">3Q超</span>}
                                    {cannotReachMin && <span className="lineup-rule-chip min-risk">2Q未達</span>}
                                </div>
                            )}
                            {isSelected && <div className="selection-check">✓</div>}
                        </button>
                    );
                })}
            </div>

            <div className="quarter-rule-hint">
                {isRegularQuarter && quarter >= 2 && unplayedNumbers.length > 0 && (
                    <p className="rule-warn">
                        ⚠ 未出場（全員出場の目安）: {unplayedNumbers.map(n => `#${formatPlayerNumber(n)}`).join(', ')}
                    </p>
                )}
                <p className="text-muted text-sm">
                    ※ ミニバスの目安: 各選手 最低2Q・最大3Q・全員出場（強制ではありません）
                </p>
            </div>
        </>
    );
}
