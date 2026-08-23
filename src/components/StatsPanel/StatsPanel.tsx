import type { Player, PlayerStats, StatEntry } from '../../types/game';
import { createInitialStats } from '../../types/game';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { isDisqualified } from '../../utils/disqualification';
import { sumUnknownStats } from '../../utils/unknownStats';
import './StatsPanel.css';

interface StatsPanelProps {
    players: Player[];
    teamName: string;
    isHistoryView?: boolean; // 履歴表示モード（trueの場合、コート上の選手ハイライトを無効化）
    /** このパネルが表す側。statHistory を渡すときは必須 */
    teamId?: string;
    /**
     * 試合の統計履歴。「不明で記録」した分を拾うためだけに使う。
     *
     * 保留アクションを不明で解決すると playerId が 'unknown' の StatEntry になり、
     * どの選手のスタッツにも入らない。この表の合計は選手スタッツの総和なので、
     * 渡さないとその分がどの数字にも現れない（ボタンは「チーム統計に記録」と
     * 言うのに記録先が無い、という状態だった）。
     */
    statHistory?: StatEntry[];
}

export function StatsPanel({
    players,
    teamName,
    isHistoryView = false,
    teamId,
    statHistory,
}: StatsPanelProps) {
    const sortedPlayers = [...players].sort((a, b) => a.number - b.number);
    const unknownStats = statHistory && teamId ? sumUnknownStats(statHistory, teamId) : null;
    // 合計は選手分と不明分の両方。不明分が無ければ従来どおり選手分だけになる
    const total = (stat: keyof PlayerStats) => sumStat(players, stat) + (unknownStats?.[stat] ?? 0);

    return (
        <div className="stats-panel">
            <h3 className="stats-panel-title">{teamName} 統計</h3>

            <div className="stats-table">
                <div className="stats-header">
                    <span className="stats-col-num">#</span>
                    <span className="stats-col-name">選手</span>
                    <span className="stats-col">PTS</span>
                    <span className="stats-col">2P</span>
                    <span className="stats-col">3P</span>
                    <span className="stats-col">FT</span>
                    <span className="stats-col">REB</span>
                    <span className="stats-col">AST</span>
                    <span className="stats-col">STL</span>
                    <span className="stats-col">BLK</span>
                    {/* ファウルは PlayerStats に無いため、この表にだけ出ていなかった */}
                    <span className="stats-col stats-col-foul">F</span>
                    <span className="stats-col stats-col-separator">TO</span>
                    <span className="stats-col stats-col-to">DD</span>
                    <span className="stats-col stats-col-to">TR</span>
                    <span className="stats-col stats-col-to">PM</span>
                    <span className="stats-col stats-col-to">CM</span>
                </div>

                {sortedPlayers.map(player => (
                    <div key={player.id} className={`stats-row ${!isHistoryView && player.isOnCourt ? 'on-court' : ''}`}>
                        <span className="stats-col-num">{formatPlayerNumber(player.number)}</span>
                        <span className="stats-col-name">{player.name}</span>
                        <span className="stats-col stats-points">{player.stats.points}</span>
                        <span className="stats-col">{formatShot(player.stats.twoPointMade, player.stats.twoPointAttempt)}</span>
                        <span className="stats-col">{formatShot(player.stats.threePointMade, player.stats.threePointAttempt)}</span>
                        <span className="stats-col">{formatShot(player.stats.freeThrowMade, player.stats.freeThrowAttempt)}</span>
                        <span className="stats-col">{player.stats.offensiveRebounds + player.stats.defensiveRebounds}</span>
                        <span className="stats-col">{player.stats.assists}</span>
                        <span className="stats-col">{player.stats.steals}</span>
                        <span className="stats-col">{player.stats.blocks}</span>
                        {/* 退場・失格は5ファウルとは限らない（D / U・T 2回）。詳細は disqualification.ts */}
                        <span className={`stats-col stats-col-foul ${isDisqualified(player.fouls) ? 'fouled-out' : ''}`}>
                            {player.fouls.length}
                        </span>
                        <span className="stats-col stats-col-separator">{player.stats.turnovers}</span>
                        <span className="stats-col stats-col-to">{player.stats.turnoverDD || 0}</span>
                        <span className="stats-col stats-col-to">{player.stats.turnoverTR || 0}</span>
                        <span className="stats-col stats-col-to">{player.stats.turnoverPM || 0}</span>
                        <span className="stats-col stats-col-to">{player.stats.turnoverCM || 0}</span>
                    </div>
                ))}

                {/* 選手が決まらないまま記録した分。合計にだけ入れて行を出さないと
                    「合計が選手の足し算と合わない」と読めてしまう */}
                {unknownStats && (
                    <div className="stats-row stats-unknown">
                        <span className="stats-col-num">?</span>
                        <span className="stats-col-name">選手不明</span>
                        <span className="stats-col stats-points">{unknownStats.points}</span>
                        <span className="stats-col">{formatShot(unknownStats.twoPointMade, unknownStats.twoPointAttempt)}</span>
                        <span className="stats-col">{formatShot(unknownStats.threePointMade, unknownStats.threePointAttempt)}</span>
                        <span className="stats-col">{formatShot(unknownStats.freeThrowMade, unknownStats.freeThrowAttempt)}</span>
                        <span className="stats-col">{unknownStats.offensiveRebounds + unknownStats.defensiveRebounds}</span>
                        <span className="stats-col">{unknownStats.assists}</span>
                        <span className="stats-col">{unknownStats.steals}</span>
                        <span className="stats-col">{unknownStats.blocks}</span>
                        {/* ファウルは不明で記録できない（保留の不明解決はSTATのみ） */}
                        <span className="stats-col stats-col-foul">-</span>
                        <span className="stats-col stats-col-separator">{unknownStats.turnovers}</span>
                        <span className="stats-col stats-col-to">{unknownStats.turnoverDD}</span>
                        <span className="stats-col stats-col-to">{unknownStats.turnoverTR}</span>
                        <span className="stats-col stats-col-to">{unknownStats.turnoverPM}</span>
                        <span className="stats-col stats-col-to">{unknownStats.turnoverCM}</span>
                    </div>
                )}

                <div className="stats-row stats-total">
                    <span className="stats-col-num"></span>
                    <span className="stats-col-name">合計</span>
                    <span className="stats-col stats-points">{total('points')}</span>
                    {/* 選手行と同じ formatShot を通す。直接書いていたため、
                        誰も打っていない種別が「0/0」と出て書き方が揃っていなかった */}
                    <span className="stats-col">{formatShot(total('twoPointMade'), total('twoPointAttempt'))}</span>
                    <span className="stats-col">{formatShot(total('threePointMade'), total('threePointAttempt'))}</span>
                    <span className="stats-col">{formatShot(total('freeThrowMade'), total('freeThrowAttempt'))}</span>
                    <span className="stats-col">{total('offensiveRebounds') + total('defensiveRebounds')}</span>
                    <span className="stats-col">{total('assists')}</span>
                    <span className="stats-col">{total('steals')}</span>
                    <span className="stats-col">{total('blocks')}</span>
                    <span className="stats-col stats-col-foul">
                        {players.reduce((sum, p) => sum + p.fouls.length, 0)}
                    </span>
                    <span className="stats-col stats-col-separator">{total('turnovers')}</span>
                    <span className="stats-col stats-col-to">{total('turnoverDD')}</span>
                    <span className="stats-col stats-col-to">{total('turnoverTR')}</span>
                    <span className="stats-col stats-col-to">{total('turnoverPM')}</span>
                    <span className="stats-col stats-col-to">{total('turnoverCM')}</span>
                </div>
            </div>
        </div>
    );
}

function formatShot(made: number, attempt: number): string {
    if (attempt === 0) return '-';
    return `${made}/${attempt}`;
}

function sumStat(players: Player[], stat: keyof PlayerStats): number {
    return players.reduce((sum, p) => sum + (p.stats[stat] as number), 0);
}
