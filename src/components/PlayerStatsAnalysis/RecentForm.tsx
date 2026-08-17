// 直近フォーム: 直近5試合平均 vs 通算平均

import { getRecentForm } from '../../utils/playerFormStats';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';

interface RecentFormProps {
    gameHistory: PlayerGameRecord[];
}

const CARDS: { key: 'points' | 'rebounds' | 'assists'; label: string }[] = [
    { key: 'points', label: '得点' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
];

export function RecentForm({ gameHistory }: RecentFormProps) {
    const form = getRecentForm(gameHistory);
    if (form.recentGames === 0) return null;

    // 全試合が直近ウィンドウに収まっている間は、直近平均＝通算平均で差は必ず0。
    // 「vs 通算平均」と称して ± 0.0 を並べると、毎試合伸びている選手が
    // 「通算と変わらない」と読めてしまうので、差そのものを出さない
    const { coversAllGames } = form;

    return (
        <div className="recent-form-section">
            <div className="section-title">
                <span className="title-text">🔥 直近フォーム</span>
                <span className="title-note">
                    {coversAllGames
                        ? `全${form.recentGames}試合の平均（通算との比較は${form.comparableFrom}試合目から）`
                        : `直近${form.recentGames}試合 vs 通算平均`}
                </span>
            </div>
            <div className="recent-form-cards">
                {CARDS.map(({ key, label }) => {
                    const delta = form.deltas[key];
                    const dir = coversAllGames ? 'flat' : delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
                    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '±';
                    const shownDelta = dir === 'flat' ? 0 : delta;
                    const sign = shownDelta > 0 ? '+' : '';
                    return (
                        <div className={`recent-form-card ${dir}`} key={key}>
                            <span className="rf-value">{form.recentAvg[key].toFixed(1)}</span>
                            {!coversAllGames && (
                                <span className={`rf-delta ${dir}`}>{arrow} {sign}{shownDelta.toFixed(1)}</span>
                            )}
                            <span className="rf-label">{label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
