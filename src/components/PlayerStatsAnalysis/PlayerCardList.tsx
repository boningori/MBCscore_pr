// 選手カードリストコンポーネント

import type { PlayerCardListProps } from './types';
import { formatPlayerNumber } from '../../utils/playerNumber';

export function PlayerCardList({ players, onPlayerClick }: PlayerCardListProps) {
    return (
        <div className="player-card-list">
            {/*
              タイルはPTS/REB/ASTが1試合平均、FG%だけが通算という混在。
              詳細画面は「得点/試合」「(累計成績)」と書き分けているのに、
              一覧には手掛かりが無く通算だと読めてしまう。タイル1つずつに
              単位を足すとカードが横に伸びるので、一覧の頭で一度だけ断る
            */}
            <p className="player-card-legend">
                PTS・REB・ASTは1試合あたりの平均、FGは通算の成功率です
            </p>
            {players.map(player => {
                const totalRebounds = player.avgStats.offensiveRebounds + player.avgStats.defensiveRebounds;
                const attempts = player.totalStats.twoPointAttempt + player.totalStats.threePointAttempt;
                // 試投0の選手に「-%」と出ていた。単位は数字があるときだけ付ける
                const fgPercent = attempts > 0
                    ? `${((player.totalStats.twoPointMade + player.totalStats.threePointMade) / attempts * 100).toFixed(0)}%`
                    : '-';
                // 出場クォーターが記録されている選手だけ平均出場Qを併記する。
                // 同じ「n試合」でも出場時間が大きく違うため（詳細は playerWorkload）。
                // 分母は出場Qが記録された試合数。全試合で割ると、記録していない試合の分だけ
                // 平均出場Qが実態より短く出る
                const quartersPerGame = player.gamesWithQuarters > 0
                    ? (player.totalQuartersPlayed / player.gamesWithQuarters).toFixed(1)
                    : null;
                // 「n試合」と「平均◯Q」は母数が違う。注記が無いと、通算が
                // n×◯Q だと読めてしまう（詳細画面の1Qあたりも同じ理由で明記している）
                const isPartialQuarters = player.gamesWithQuarters < player.gamesPlayed;

                return (
                    <button
                        type="button"
                        key={player.playerKey}
                        className="player-card"
                        onClick={() => onPlayerClick(player)}
                    >
                        <div className="player-info">
                            <span className="player-number">#{formatPlayerNumber(player.number)}</span>
                            <span className="player-name">{player.name}</span>
                            <span className="player-games">
                                {player.gamesPlayed}試合
                                {quartersPerGame && (
                                    <span
                                        className="player-quarters"
                                        title={isPartialQuarters
                                            ? `出場クォーターが記録されている${player.gamesWithQuarters}試合のみの平均です`
                                            : undefined}
                                    >
                                        平均{quartersPerGame}Q
                                        {isPartialQuarters && (
                                            <span className="player-quarters-basis">{player.gamesWithQuarters}試合分</span>
                                        )}
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="player-stats-grid">
                            <div className="stat-box primary">
                                <span className="stat-value">{player.avgStats.points.toFixed(1)}</span>
                                <span className="stat-label">PTS</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{totalRebounds.toFixed(1)}</span>
                                <span className="stat-label">REB</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{player.avgStats.assists.toFixed(1)}</span>
                                <span className="stat-label">AST</span>
                            </div>
                            <div className="stat-box">
                                <span className="stat-value">{fgPercent}</span>
                                <span className="stat-label">FG</span>
                            </div>
                        </div>
                        <div className="card-arrow">›</div>
                    </button>
                );
            })}
        </div>
    );
}
