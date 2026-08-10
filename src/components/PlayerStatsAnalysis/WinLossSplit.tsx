// 勝敗別スプリット: 勝ち試合 vs 負け試合の平均スタッツ

import { getWinLossSplit, type SplitStats } from '../../utils/playerFormStats';
import type { PlayerGameRecord } from '../../utils/playerStatsAnalysis';

interface WinLossSplitProps {
    gameHistory: PlayerGameRecord[];
}

const ROWS: { key: keyof SplitStats; label: string }[] = [
    { key: 'points', label: '得点' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
    { key: 'steals', label: 'STL' },
    { key: 'turnovers', label: 'TO' },
];

export function WinLossSplit({ gameHistory }: WinLossSplitProps) {
    const split = getWinLossSplit(gameHistory);
    const cell = (side: { n: number; avg: SplitStats }, key: keyof SplitStats) =>
        side.n === 0 ? '—' : side.avg[key].toFixed(1);
    const incomplete = split.win.n === 0 || split.loss.n === 0;
    // ミニバスで引き分けはまれ。0件のときに空の列を足すと表が読みにくくなるので、
    // あるときだけ出す。無いまま隠すと n の合計が試合数と合わない理由が分からなくなる
    const showDraw = split.draw.n > 0;

    return (
        <div className="win-loss-split-section">
            <div className="section-title">
                <span className="title-text">⚖️ 勝敗別スプリット</span>
            </div>
            <table className="win-loss-table">
                <thead>
                    <tr>
                        <th></th>
                        <th className="win-col">勝ち (n={split.win.n})</th>
                        <th className="loss-col">負け (n={split.loss.n})</th>
                        {showDraw && <th className="draw-col">引分 (n={split.draw.n})</th>}
                    </tr>
                </thead>
                <tbody>
                    {ROWS.map(({ key, label }) => (
                        <tr key={key}>
                            <td className="wl-label">{label}</td>
                            <td className="win-col">{cell(split.win, key)}</td>
                            <td className="loss-col">{cell(split.loss, key)}</td>
                            {showDraw && <td className="draw-col">{cell(split.draw, key)}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
            {incomplete && (
                <p className="wl-note">比較には勝ち・負け両方の試合が必要です</p>
            )}
        </div>
    );
}
