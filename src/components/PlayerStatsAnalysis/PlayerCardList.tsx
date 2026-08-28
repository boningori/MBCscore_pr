// 選手カードリストコンポーネント

import type { PlayerCardListProps } from './types';
import { formatPlayerNumber } from '../../utils/playerNumber';

export function PlayerCardList({
    players,
    hiddenPlayerKeys,
    onPlayerClick,
    selectionMode = false,
    selectedKeys,
    onToggleSelect,
    mergedKeys,
}: PlayerCardListProps) {
    // 「（n試合分）」が付く選手が1人でもいるか。
    //
    // この但し書きの意味は title 属性にしか書いていなかった。主な利用端末は
    // タブレットとスマホで、そこにホバーは無いので事実上どこにも出ていない。
    // カード1枚ずつに文章を足すと一覧が縦に伸びるので、凡例に一度だけ足す
    const hasPartialQuarters = players.some(p => p.gamesWithQuarters > 0 && p.gamesWithQuarters < p.gamesPlayed);

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
                {hasPartialQuarters && '／「平均◯Q」の（n試合分）は、出場クォーターが記録されている試合だけの平均です'}
            </p>
            {players.map(player => {
                // 非表示にしている選手。全員表示に切り替えたときだけ一覧に現れる。
                // 印が無いと、どれを非表示にしたのか一覧からは分からず、
                // 戻したい選手を1人ずつ詳細で開いて確かめるしかなかった
                const isHidden = hiddenPlayerKeys?.has(player.playerKey) ?? false;
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
                const isSelected = selectedKeys?.has(player.playerKey) ?? false;
                const isMerged = mergedKeys?.has(player.playerKey) ?? false;

                return (
                    <button
                        type="button"
                        key={player.playerKey}
                        className={`player-card ${isHidden ? 'hidden-player' : ''} ${selectionMode ? 'selecting' : ''} ${isSelected ? 'selected' : ''}`}
                        // 選択モード中に詳細が開くと統合する相手を選べない
                        onClick={() => selectionMode
                            ? onToggleSelect?.(player.playerKey)
                            : onPlayerClick(player)}
                        // 選択モード中は未選択も false として読み上げる（選べることが伝わる）
                        aria-pressed={selectionMode ? isSelected : undefined}
                    >
                        <div className="player-info">
                            <span className="player-number">#{formatPlayerNumber(player.number)}</span>
                            <span className="player-name">{player.name}</span>
                            {/* 色や枠だけでは伝わらないので文字でも出す */}
                            {isHidden && <span className="player-hidden-badge">非表示</span>}
                            {/* 色や枠だけでは伝わらないので文字でも出す（非表示の印と同じ扱い） */}
                            {isMerged && <span className="player-merged-badge">統合済み</span>}
                            <span className="player-games">
                                {player.gamesPlayed}試合
                                {quartersPerGame && (
                                    <span className="player-quarters">
                                        平均{quartersPerGame}Q
                                        {/* 但し書きの意味は凡例に出す（title はタッチ端末で読めない） */}
                                        {/* 括弧は文字として置く。CSSの ::before/::after で足すと、
                                            読み上げでは拾われる保証が無く、文字列としてコピーしたときにも
                                            落ちる。意味を担う記号をスタイルに預けない */}
                                        {isPartialQuarters && (
                                            <span className="player-quarters-basis">（{player.gamesWithQuarters}試合分）</span>
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
                                {/* 率だけでは 1/1 と 19/19 のどちらも「100%」で、
                                    一覧からは見分けられない。ミニバスは1人あたりの
                                    試投数が少なく、1本だけの100%が並ぶのは珍しくない
                                    ので、分母を添えて母数の違いが見えるようにする */}
                                {attempts > 0 && (
                                    <span className="stat-sub">
                                        {player.totalStats.twoPointMade + player.totalStats.threePointMade}/{attempts}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="card-arrow">›</div>
                    </button>
                );
            })}
        </div>
    );
}
