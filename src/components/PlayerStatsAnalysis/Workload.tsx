// 出場時間で均した指標: 平均出場クォーターと1Qあたりのスタッツ

import { getWorkload } from '../../utils/playerWorkload';
import type { AggregatedPlayerStats } from '../../utils/playerStatsAnalysis';

interface WorkloadProps {
    player: AggregatedPlayerStats;
}

export function Workload({ player }: WorkloadProps) {
    const workload = getWorkload({
        gamesPlayed: player.gamesPlayed,
        totalQuartersPlayed: player.totalQuartersPlayed,
        points: player.totalStats.points,
        rebounds: player.totalStats.offensiveRebounds + player.totalStats.defensiveRebounds,
        assists: player.totalStats.assists,
    });

    // 出場クォーターが記録されていない試合しか無ければ何も出さない。
    // 詳細は playerWorkload.getWorkload のコメント
    if (!workload) return null;

    const cards: { key: keyof typeof workload.perQuarter; label: string }[] = [
        { key: 'points', label: '得点' },
        { key: 'rebounds', label: 'REB' },
        { key: 'assists', label: 'AST' },
    ];

    return (
        <div className="workload-section">
            <div className="section-title">
                <span className="title-text">⏱️ 1クォーターあたり</span>
                <span className="title-note">
                    平均出場 {workload.quartersPerGame.toFixed(1)}Q／試合（通算{player.totalQuartersPlayed}Q）
                </span>
            </div>
            <div className="workload-cards">
                {cards.map(({ key, label }) => (
                    <div className="workload-card" key={key}>
                        <span className="wl-value">{workload.perQuarter[key].toFixed(1)}</span>
                        <span className="wl-label">{label}/Q</span>
                    </div>
                ))}
            </div>
            {/* 出場時間の違いを均した値であることを明示する。
                「試合平均」と並べると、どちらを見ているのか分からなくなるため */}
            <p className="workload-note">
                出場クォーター数で割った値です。出場時間が違う選手どうしを比べるときに使えます。
            </p>
        </div>
    );
}
