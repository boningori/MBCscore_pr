import { useRef, useState } from 'react';
import type { Game, GameInfo } from '../../types/game';
import { formatFoulDisplay, createInitialGameInfo } from '../../types/game';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { exportElement, generateScoresheetFilename } from '../../utils/pdfExport';
import { useExportAction } from '../../hooks/useExportAction';
import { countFirstHalfFouls } from './halfTimeFouls';
import { GameInfoModal } from '../GameInfoModal';
import './RunningScoresheet.css';

interface RunningScoresheetProps {
    game: Game;
    gameName?: string;
    date?: string;
    onClose?: () => void;
    onUpdateGameInfo?: (gameInfo: Partial<GameInfo>) => void;
    onEndTimeChange?: (endTime: Date | null) => void;
}

/**
 * 4Q欄に出すチームファウル数。OTがあれば通算した最後の枠を使う。
 *
 * END_QUARTER は「OTは第4Qの延長」としてリセットせず枠を足し、直前ピリオドの
 * 数から通算し続ける（gameFlowHandlers）。ペナルティ判定はその枠を見ているのに、
 * シートは teamFouls[3] 固定だったため、OT中に増えたファウルが公式様式から
 * 丸ごと消えていた。様式には4つのピリオド欄しか無いので、規則どおり4Qに続けて出す。
 */
function fourthPeriodFouls(teamFouls: number[]): number {
    if (teamFouls.length <= 4) return teamFouls[3] ?? 0;
    return teamFouls[teamFouls.length - 1] ?? 0;
}

export function RunningScoresheet({ game, gameName = '', date = '', onClose, onUpdateGameInfo, onEndTimeChange }: RunningScoresheetProps) {
    const scoresheetRef = useRef<HTMLDivElement>(null);
    const [showGameInfoModal, setShowGameInfoModal] = useState(false);
    const { isExporting, runExport } = useExportAction();

    const { teamA, teamB, scoreHistory, foulHistory, currentQuarter, phase, endTime } = game;
    const gameInfo = game.gameInfo || createInitialGameInfo();

    // 試合状態の判定
    const isGameFinished = phase === 'finished';
    const isHalfFinished = currentQuarter > 2 || isGameFinished; // 前半終了（2Q以降に進んでいる）

    // PDF出力
    const handleExportPDF = () => {
        if (!scoresheetRef.current) return;
        const element = scoresheetRef.current;
        const filename = generateScoresheetFilename(gameName, date, teamA.name, teamB.name);
        return runExport(() => exportElement(element, { filename, format: 'pdf' }), 'PDF');
    };

    // JPEG出力
    const handleExportJPEG = () => {
        if (!scoresheetRef.current) return;
        const element = scoresheetRef.current;
        const filename = generateScoresheetFilename(gameName, date, teamA.name, teamB.name);
        return runExport(() => exportElement(element, { filename, format: 'jpeg' }), 'JPEG');
    };

    // 最終スコア
    const finalScoreA = teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
    const finalScoreB = teamB.players.reduce((sum, p) => sum + p.stats.points, 0);

    // Calculate scores by period from scoreHistory
    const scoresByPeriod: { [key: string]: { A: number, B: number } } = {
        '1Q': { A: 0, B: 0 },
        '2Q': { A: 0, B: 0 },
        '3Q': { A: 0, B: 0 },
        '4Q': { A: 0, B: 0 },
        'OT': { A: 0, B: 0 }
    };

    scoreHistory.forEach(entry => {
        const quarterKey = entry.quarter <= 4 ? `${entry.quarter}Q` : 'OT';
        if (entry.teamId === 'teamA') {
            scoresByPeriod[quarterKey].A += entry.points;
        } else {
            scoresByPeriod[quarterKey].B += entry.points;
        }
    });

    const renderPlayerRow = (player: typeof teamA.players[0], index: number, allPlayers: typeof teamA.players) => {
        // 選手のファウル数（試合終了時の「未使用欄」判定に使う現在の合計）
        const foulCount = player.fouls.length;

        // ハーフタイムの太線は前半終了時点の記入位置を示すため、合計ではなく前半分で数える。
        // 合計で数えると後半にファウルが増えるたびに区切りが右へ動いてしまう
        const halfCount = countFirstHalfFouls(foulHistory, player.id);

        // 隣接選手の前半ファウル数（階段状境界線用）
        const prevHalfCount = index > 0 ? countFirstHalfFouls(foulHistory, allPlayers[index - 1]?.id) : halfCount;
        const nextHalfCount = index < 14 ? countFirstHalfFouls(foulHistory, allPlayers[index + 1]?.id) : halfCount;

        // この選手のファウル履歴をfoulHistoryから取得（クォーター情報取得用）
        const playerFoulHistory = foulHistory
            .filter(f => f.playerId === player.id)
            .sort((a, b) => a.timestamp - b.timestamp);

        return (
            <tr key={player.id}>
                <td className="cell-no">{index + 1}</td>
                <td className="cell-license">
                    {(() => {
                        const raw = player.licenseNo || '';
                        const last3 = raw.length >= 3 ? raw.slice(-3) : raw.padStart(3, '');
                        return (
                            <div className="license-digits">
                                <span className="license-digit">{last3[0] || ''}</span>
                                <span className="license-digit">{last3[1] || ''}</span>
                                <span className="license-digit">{last3[2] || ''}</span>
                            </div>
                        );
                    })()}
                </td>
                <td className="cell-name">{player.name}</td>
                <td className="cell-number">{formatPlayerNumber(player.number)}</td>
                {[1, 2, 3, 4].map(q => {
                    const playType = player.quartersPlayed[q - 1];
                    // 1Q/3Q=赤, 2Q/4Q=黒
                    const colorClass = (q === 1 || q === 3) ? 'q-red' : 'q-black';
                    // starter=右上→左下（＼）, sub=左上→右下（／）, both=×（両方重ねる）
                    // 後方互換: true（旧boolean形式）はstarterとして扱う
                    const isStarter = playType === 'starter' || (playType as unknown) === true;
                    const slashClass = playType === 'both' ? 'slash-both' : isStarter ? 'slash-starter' : playType === 'sub' ? 'slash-sub' : '';
                    return (
                        <td key={q} className={`cell-quarter ${playType ? `${slashClass} ${colorClass}` : ''}`}>
                        </td>
                    );
                })}
                {[0, 1, 2, 3, 4].map(f => {
                    const hasFoul = player.fouls[f];
                    // 階段状の境界は前半終了時点の記入状況で決まる
                    const isUsedInFirstHalf = halfCount > f;
                    const isLastFirstHalfFoul = f === halfCount - 1 && halfCount > 0;
                    const isUnusedFoul = f >= foulCount;

                    // クラス構築
                    const classes = ['cell-foul'];

                    // ファウルのクォーター情報を取得して色クラスを適用
                    if (hasFoul && playerFoulHistory[f]) {
                        const quarter = playerFoulHistory[f].quarter;
                        // 1Q/3Q=赤, 2Q/4Q/OT=黒
                        const colorClass = (quarter === 1 || quarter === 3) ? 'q-red' : 'q-black';
                        classes.push(colorClass);
                    }

                    // 第2Q終了時: 階段状の太線境界
                    if (isHalfFinished) {
                        // 前半最後のファウル枠の右に太線
                        if (isLastFirstHalfFoul) {
                            classes.push('foul-half-border');
                        }
                        // 上境界: このセルが前半で使用済みで、上の選手の同じ位置が未使用の場合
                        // ただし選手1（index=0）の上辺は外枠なので除外
                        if (isUsedInFirstHalf && index > 0 && prevHalfCount <= f) {
                            classes.push('foul-half-border-top');
                        }
                        // 下境界: このセルが前半で使用済みで、下の選手の同じ位置が未使用の場合
                        // ただし選手15（index=14）の下辺は外枠なので除外
                        if (isUsedInFirstHalf && index < 14 && nextHalfCount <= f) {
                            classes.push('foul-half-border-bottom');
                        }
                    }

                    // 試合終了時: 未使用の欄に横線
                    if (isGameFinished && isUnusedFoul) {
                        classes.push('foul-unused');
                    }

                    return (
                        <td key={f} className={classes.join(' ')}>
                            {hasFoul ? formatFoulDisplay(player.fouls[f]) : ''}
                        </td>
                    );
                })}
            </tr>
        );
    };

    return (
        <div className="running-scoresheet-container">
            {/* ツールバー */}
            <div className="scoresheet-toolbar">
                <button className="btn btn-primary" onClick={handleExportPDF} disabled={isExporting}>
                    PDF出力
                </button>
                <button className="btn btn-secondary" onClick={handleExportJPEG} disabled={isExporting}>
                    JPEG出力
                </button>
                <button className="btn btn-secondary" onClick={() => setShowGameInfoModal(true)} disabled={isExporting}>
                    試合情報編集
                </button>
                {onClose && (
                    <button className="btn btn-secondary" onClick={onClose}>
                        閉じる
                    </button>
                )}
                {/* 出力は端末によっては十数秒かかる。ボタンのラベルを差し替えず
                    別領域で知らせることで、読み上げ名（PDF出力/JPEG出力）を保つ */}
                <span className="scoresheet-export-status" role="status">
                    {isExporting ? '出力中… そのままお待ちください' : ''}
                </span>
            </div>

            <p className="rs-unofficial-note">
                ※JBA公式スコアシート準拠レイアウト（JBA公認製品ではありません）。公式記録は大会指定のスコアシートが優先されます。
            </p>

            {/* スコアシート本体 */}
            <div className="running-scoresheet" ref={scoresheetRef}>
                {/* Logo & Title Header */}
                <div className="rs-top-header">
                    <div className="rs-logo-container">
                        <span className="jba-text">JBA</span>
                        <span className="jba-sub">JAPAN BASKETBALL ASSOCIATION</span>
                    </div>
                    <h1 className="rs-main-title">MINI-BASKETBALL OFFICIAL SCORESHEET</h1>
                </div>

                {/* Header Section (Official Layout) - Full Width (2400px) */}
                <div className="rs-header-grid">
                    {/* Top Row: Competition & Game Info */}
                    <div className="rs-header-top-row">
                        <div className="rs-competition-box">
                            <span className="rs-field-label">大会名</span>
                            <span className="rs-competition-value">{gameName}</span>
                        </div>
                        <div className="rs-game-info-box">
                            <div className="rs-date-time-row">
                                <div className="rs-date-box">
                                    <span className="rs-field-label">日付</span>
                                    {(() => {
                                        const [y, m, d] = date ? date.replace(/-/g, '/').split('/') : ['', '', ''];
                                        return (
                                            <>
                                                <span className="rs-date-part year">{y}</span>
                                                <span className="rs-date-label">年</span>
                                                <span className="rs-date-part month">{m}</span>
                                                <span className="rs-date-label">月</span>
                                                <span className="rs-date-part day">{d}</span>
                                                <span className="rs-date-label">日</span>
                                            </>
                                        );
                                    })()}
                                </div>
                                <div className="rs-time-box">
                                    <span className="rs-field-label">時間</span>
                                    <span>{gameInfo.time || ':'}</span>
                                </div>
                            </div>
                            <div className="rs-place-game-row">
                                <div className="rs-place-box">
                                    <span className="rs-field-label">会場</span>
                                    <span className="rs-place-val">{gameInfo.venue}</span>
                                </div>
                                <div className="rs-game-no-box">
                                    <span className="rs-field-label">Game No.</span>
                                    <span>{gameInfo.gameNo}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Second Row: Scores & Officials */}
                    <div className="rs-header-second-row">
                        {/* Score Section */}
                        <div className="rs-score-display-section">
                            <div className="rs-score-label-area">
                                <span>スコア</span>
                                <span className="score-en">Score</span>
                            </div>
                            <div className="rs-teams-score-container">
                                <div className="rs-team-score-box">
                                    <span className="rs-ts-team-name">チームA</span>
                                    <div className="rs-ts-box">
                                        <span className="rs-ts-score-val">{finalScoreA}</span>
                                    </div>
                                </div>
                                <div className="rs-brace">{'{'}</div>
                                {/* Center Breakdown: Q1-Q4, OT */}
                                <div className="rs-score-breakdown">
                                    {/* 1Q/3Qは赤、2Q/4Q・OTは黒（記入色に合わせる） */}
                                    <div className="rs-sb-row q-red"><span className="val">{scoresByPeriod['1Q'].A}</span><span className="sep">―</span><span className="val">{scoresByPeriod['1Q'].B}</span></div>
                                    <div className="rs-sb-row q-black"><span className="val">{scoresByPeriod['2Q'].A}</span><span className="sep">―</span><span className="val">{scoresByPeriod['2Q'].B}</span></div>
                                    <div className="rs-sb-row q-red"><span className="val">{scoresByPeriod['3Q'].A}</span><span className="sep">―</span><span className="val">{scoresByPeriod['3Q'].B}</span></div>
                                    <div className="rs-sb-row q-black"><span className="val">{scoresByPeriod['4Q'].A}</span><span className="sep">―</span><span className="val">{scoresByPeriod['4Q'].B}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['OT'].A}</span><span className="sep ot-label">(延長)</span><span className="val">{scoresByPeriod['OT'].B}</span></div>
                                </div>
                                <div className="rs-brace">{'}'}</div>
                                <div className="rs-team-score-box">
                                    <span className="rs-ts-team-name">チームB</span>
                                    <div className="rs-ts-box">
                                        <span className="rs-ts-score-val">{finalScoreB}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Officials Section */}
                        <div className="rs-officials-table">
                            <div className="rs-official-row">
                                <div className="rs-official-cell label-cell">クルーチーフ</div>
                                <div className="rs-official-cell value-cell">{gameInfo.crewChief}</div>
                                <div className="rs-official-cell label-cell">アンパイア</div>
                                <div className="rs-official-cell value-cell">{gameInfo.umpire}</div>
                            </div>
                            <div className="rs-official-row">
                                <div className="rs-official-cell label-cell">スコアラー</div>
                                <div className="rs-official-cell value-cell">{gameInfo.scorer}</div>
                                <div className="rs-official-cell label-cell">タイマー</div>
                                <div className="rs-official-cell value-cell">{gameInfo.timer}</div>
                            </div>
                            <div className="rs-official-row">
                                <div className="rs-official-cell label-cell">A・スコアラー</div>
                                <div className="rs-official-cell value-cell">{gameInfo.assistantScorer}</div>
                                <div className="rs-official-cell label-cell">ショットクロックオペレーター</div>
                                <div className="rs-official-cell value-cell">{gameInfo.shotClockOperator}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content (3 Column Layout: Teams | Center | Running Score) */}
                <div className="rs-main-content">
                    {/* Left Column: Teams */}
                    <div className="rs-teams-section">
                        {[teamA, teamB].map((team, tIndex) => (
                            <div key={team.id} className="rs-team-block">
                                <table className="rs-roster-table">
                                    <thead>
                                        {/* チーム名 + タイムアウト */}
                                        <tr className="team-header-row">
                                            <td rowSpan={3} colSpan={8} className="team-name-cell">
                                                <div className="team-name-row">
                                                    <span className="rs-team-label">{tIndex === 0 ? 'チームA：' : 'チームB：'}</span>
                                                    <span className="team-name-label">{team.name}</span>
                                                </div>
                                                <div className="team-name-sub">{tIndex === 0 ? 'Team A' : 'Team B'}</div>
                                                <div className="team-category-paren">（{team.color === 'white' ? '白' : '青'}）</div>
                                            </td>
                                            <th colSpan={5} className="timeout-header-cell">タイムアウト</th>
                                        </tr>
                                        <tr className="timeout-label-row">
                                            <td className="to-cell-label">①</td>
                                            <td className="to-cell-label">②</td>
                                            <td className="to-cell-label">③</td>
                                            <td className="to-cell-label">④</td>
                                            <td className="to-cell-label">OT</td>
                                        </tr>
                                        <tr className="timeout-value-row">
                                            {[1, 2, 3, 4].map(q => {
                                                const timeout = team.timeouts.find(t => t.quarter === q);
                                                const hasTimeout = !!timeout;
                                                const colorClass = (q === 1 || q === 3) ? 'q-red' : 'q-black';
                                                const isUnused = isGameFinished && !hasTimeout;
                                                return (
                                                    <td key={q} className={`to-cell-val ${hasTimeout ? `to-has-value ${colorClass}` : ''} ${isUnused ? `to-unused ${colorClass}` : ''}`}>
                                                        {hasTimeout && <span className="to-elapsed-minutes">{timeout.elapsedMinutes}</span>}
                                                    </td>
                                                );
                                            })}
                                            {(() => {
                                                const otTimeout = team.timeouts.find(t => t.quarter > 4);
                                                const hasOtTimeout = !!otTimeout;
                                                const isOtUnused = isGameFinished && !hasOtTimeout;
                                                return (
                                                    <td className={`to-cell-val ot ${hasOtTimeout ? 'to-has-value q-black' : ''} ${isOtUnused ? 'to-unused' : ''}`}>
                                                        {hasOtTimeout && <span className="to-elapsed-minutes">{otTimeout.elapsedMinutes}</span>}
                                                    </td>
                                                );
                                            })()}
                                        </tr>
                                        {/* 選手ヘッダー */}
                                        <tr>
                                            <th rowSpan={2} className="th-no">No.</th>
                                            <th rowSpan={2} className="th-license">ライセンスNo.</th>
                                            <th rowSpan={2} className="th-name">
                                                選手氏名<br />
                                                <span className="en">Players</span>
                                            </th>
                                            <th rowSpan={2} className="th-number">No.</th>
                                            <th colSpan={4} className="th-time">出場時限</th>
                                            <th colSpan={5} className="th-foul">ファウル</th>
                                        </tr>
                                        <tr className="sub-header">
                                            <th>①</th>
                                            <th>②</th>
                                            <th>③</th>
                                            <th>④</th>
                                            <th>1</th>
                                            <th>2</th>
                                            <th>3</th>
                                            <th>4</th>
                                            <th>5</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {team.players.slice(0, 15).map((p, i) => renderPlayerRow(p, i, team.players))}
                                        {Array.from({ length: Math.max(0, 15 - team.players.length) }).map((_, i, arr) => (
                                            <tr key={`empty-${team.id}-${i}`} className="empty-player-row">
                                                <td className="cell-no">{team.players.length + i + 1}</td>
                                                {/* ライセンス〜出場時限: 一番上の行のみ横線 */}
                                                <td className={`cell-license ${i === 0 ? 'empty-cell-line' : ''}`}>
                                                    <div className="license-digits">
                                                        <span className="license-digit"></span>
                                                        <span className="license-digit"></span>
                                                        <span className="license-digit"></span>
                                                    </div>
                                                </td>
                                                <td className={`cell-name ${i === 0 ? 'empty-cell-line' : ''}`}></td>
                                                <td className={`cell-number ${i === 0 ? 'empty-cell-line' : ''}`}></td>
                                                {[1, 2, 3, 4].map(q => <td key={q} className={`cell-quarter ${i === 0 ? 'empty-cell-line' : ''}`}></td>)}
                                                {/* ファウル欄: 空行全体で斜線（最初の行の最初のセルにSVGを配置） */}
                                                {[0, 1, 2, 3, 4].map(f => (
                                                    <td key={f} className={`cell-foul empty-foul-cell ${i === 0 && f === 0 ? 'empty-foul-slash-container' : ''}`}>
                                                        {i === 0 && f === 0 && arr.length > 0 && (
                                                            <svg
                                                                className="empty-foul-slash"
                                                                style={{
                                                                    width: `calc(4.6mm * 5)`,
                                                                    height: `calc(5mm * ${arr.length})`,
                                                                }}
                                                            >
                                                                <line x1="0" y1="2.5mm" x2="100%" y2="100%" />
                                                            </svg>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                        {/* Coach Rows */}
                                        <tr className="coach-row">
                                            <td colSpan={2} className="coach-label">コーチ:</td>
                                            <td colSpan={6} className="coach-name">
                                                <div className="coach-license-area">
                                                    {(() => {
                                                        const raw = team.coachLicenseNo || '';
                                                        const last3 = raw.length >= 3 ? raw.slice(-3) : raw.padStart(3, '');
                                                        return (
                                                            <>
                                                                <span className="license-digit">{last3[0] || ''}</span>
                                                                <span className="license-digit">{last3[1] || ''}</span>
                                                                <span className="license-digit">{last3[2] || ''}</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                {team.coachName}
                                            </td>
                                            {(() => {
                                                // コーチのファウル履歴をfoulHistoryから取得
                                                const coachFoulHistory = foulHistory
                                                    .filter(f => f.teamId === team.id && f.coachFoulTarget === 'COACH')
                                                    .sort((a, b) => a.timestamp - b.timestamp);
                                                return [0, 1, 2].map(i => {
                                                    const f = team.coachFouls[i];
                                                    const display = f === 'T' ? 'C' : f === 'BT' ? 'B' : f || '';
                                                    const isUnused = !f && isGameFinished;
                                                    // クォーター情報から色クラスを決定
                                                    const quarter = coachFoulHistory[i]?.quarter;
                                                    const colorClass = f && quarter ? ((quarter === 1 || quarter === 3) ? 'q-red' : 'q-black') : '';
                                                    return <td key={i} className={`cell-foul ${colorClass} ${isUnused ? 'foul-unused' : ''}`}>{display}</td>;
                                                });
                                            })()}
                                            <td className={`cell-foul ${isGameFinished ? 'foul-unused' : ''}`}></td>
                                            <td className={`cell-foul ${isGameFinished ? 'foul-unused' : ''}`}></td>
                                        </tr>
                                        <tr className="coach-row">
                                            <td colSpan={2} className="coach-label">A.コーチ:</td>
                                            <td colSpan={6} className="coach-name">
                                                <div className="coach-license-area">
                                                    {(() => {
                                                        const raw = team.assistantCoachLicenseNo || '';
                                                        const last3 = raw.length >= 3 ? raw.slice(-3) : raw.padStart(3, '');
                                                        return (
                                                            <>
                                                                <span className="license-digit">{last3[0] || ''}</span>
                                                                <span className="license-digit">{last3[1] || ''}</span>
                                                                <span className="license-digit">{last3[2] || ''}</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                {team.assistantCoachName}
                                            </td>
                                            {(() => {
                                                // Aコーチのファウル履歴をfoulHistoryから取得
                                                const aCoachFoulHistory = foulHistory
                                                    .filter(f => f.teamId === team.id && f.coachFoulTarget === 'ACOACH')
                                                    .sort((a, b) => a.timestamp - b.timestamp);
                                                return [0, 1, 2].map(i => {
                                                    const f = team.assistantCoachFouls?.[i];
                                                    const display = f === 'T' ? 'C' : f === 'BT' ? 'B' : f || '';
                                                    const isUnused = !f && isGameFinished;
                                                    // クォーター情報から色クラスを決定
                                                    const quarter = aCoachFoulHistory[i]?.quarter;
                                                    const colorClass = f && quarter ? ((quarter === 1 || quarter === 3) ? 'q-red' : 'q-black') : '';
                                                    return <td key={i} className={`cell-foul ${colorClass} ${isUnused ? 'foul-unused' : ''}`}>{display}</td>;
                                                });
                                            })()}
                                            <td className={`cell-foul ${isGameFinished ? 'foul-unused' : ''}`}></td>
                                            <td className={`cell-foul ${isGameFinished ? 'foul-unused' : ''}`}></td>
                                        </tr>
                                    </tbody>
                                </table>
                                {/* Team Fouls Section moved below or keep layout?
                                    The image didn't show team fouls. 
                                    Standard scoresheet usually has Team Fouls. 
                                    I will keep it for functionality but style it minimally below.
                                */}
                                {/* Team Fouls Moved to Center Section */}
                            </div>
                        ))}
                        <div className="rs-license-note">※ライセンスNo. とは、JBA登録番号(メンバーID)の下3桁を記入してください。</div>
                    </div>

                    {/* Center Column: Team Fouls */}
                    <div className="rs-center-section">
                        {[teamA, teamB].map((team) => (
                            <div key={`center-${team.id}`} className="rs-center-team-block">
                                <div className="rs-tf-title-box">
                                    チーム<br />ファウル
                                </div>
                                <div className="rs-tf-grid-group">
                                    <div className="rs-tf-grid">
                                        <div className="rs-tf-header-cell">1Q</div>
                                        <div className="rs-tf-header-cell">2Q</div>
                                        {[1, 2, 3, 4].map(num => {
                                            const is1QMarked = team.teamFouls[0] >= num;
                                            const is2QMarked = team.teamFouls[1] >= num;
                                            // 試合終了時、未使用の枠に縦線
                                            const is1QUnused = isGameFinished && !is1QMarked;
                                            const is2QUnused = isGameFinished && !is2QMarked;
                                            return [
                                                <div key={`${team.id}-1q-${num}`} className={`rs-tf-cell ${is1QMarked ? 'marked q-red' : ''} ${is1QUnused ? 'tf-unused q-red' : ''}`}>{num}</div>,
                                                <div key={`${team.id}-2q-${num}`} className={`rs-tf-cell ${is2QMarked ? 'marked q-black' : ''} ${is2QUnused ? 'tf-unused q-black' : ''}`}>{num}</div>
                                            ];
                                        })}
                                    </div>
                                </div>
                                <div className="rs-tf-grid-group">
                                    <div className="rs-tf-grid">
                                        <div className="rs-tf-header-cell">3Q</div>
                                        <div className="rs-tf-header-cell">4Q</div>
                                        {[1, 2, 3, 4].map(num => {
                                            const is3QMarked = team.teamFouls[2] >= num;
                                            const is4QMarked = fourthPeriodFouls(team.teamFouls) >= num;
                                            // 試合終了時、未使用の枠に縦線
                                            const is3QUnused = isGameFinished && !is3QMarked;
                                            const is4QUnused = isGameFinished && !is4QMarked;
                                            return [
                                                <div key={`${team.id}-3q-${num}`} className={`rs-tf-cell ${is3QMarked ? 'marked q-red' : ''} ${is3QUnused ? 'tf-unused q-red' : ''}`}>{num}</div>,
                                                <div key={`${team.id}-4q-${num}`} className={`rs-tf-cell ${is4QMarked ? 'marked q-black' : ''} ${is4QUnused ? 'tf-unused q-black' : ''}`}>{num}</div>
                                            ];
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right Column: Running Score */}
                    <div className="rs-running-score-section">
                        <div className="rs-rs-header-title-row">
                            <span className="jp">ランニング スコア</span>
                            <span className="en">RUNNING SCORE</span>
                        </div>
                        <div className="rs-rs-columns-container">
                            {[0, 1, 2].map(colIndex => {
                                const rowsPerColumn = 40;
                                const startScore = colIndex * rowsPerColumn + 1;
                                const endScore = startScore + rowsPerColumn - 1;

                                // 試合終了後の未使用セル用斜線の計算
                                // Aチーム: この列に最終得点があるか、またはこの列より前で終了しているか
                                const finalScoreInColA = finalScoreA >= startScore && finalScoreA <= endScore;
                                const colEndedBeforeA = finalScoreA < startScore;
                                // Bチーム
                                const finalScoreInColB = finalScoreB >= startScore && finalScoreB <= endScore;
                                const colEndedBeforeB = finalScoreB < startScore;

                                // 斜線の開始行（0-indexed）
                                const slashStartRowA = finalScoreInColA ? (finalScoreA - startScore + 1) : (colEndedBeforeA ? 0 : -1);
                                const slashStartRowB = finalScoreInColB ? (finalScoreB - startScore + 1) : (colEndedBeforeB ? 0 : -1);

                                // 斜線を引く必要があるか（試合に得点がある場合のみ）
                                const needSlashA = finalScoreA > 0 && slashStartRowA >= 0 && slashStartRowA < rowsPerColumn;
                                const needSlashB = finalScoreB > 0 && slashStartRowB >= 0 && slashStartRowB < rowsPerColumn;

                                return (
                                    <div key={colIndex} className="rs-rs-column">
                                        <div className="rs-rs-col-header">
                                            <div className="rs-rs-header-cell a-side">A</div>
                                            <div className="rs-rs-header-cell b-side">B</div>
                                        </div>
                                        <div className="rs-rs-rows-container">
                                            {Array.from({ length: 40 }).map((_, rowIndex) => {
                                                const scoreVal = startScore + rowIndex;

                                                // Data Logic
                                                const entryA = scoreHistory.find(s => s.teamId === 'teamA' && s.runningScoreA === scoreVal);
                                                const entryB = scoreHistory.find(s => s.teamId === 'teamB' && s.runningScoreB === scoreVal);

                                                const quarterA = entryA?.quarter;
                                                const quarterB = entryB?.quarter;
                                                // 1Q/3Q=赤, 2Q/4Q/OT=黒
                                                const quarterClassA = quarterA ? (quarterA === 1 || quarterA === 3 ? 'q-red' : 'q-black') : '';
                                                const quarterClassB = quarterB ? (quarterB === 1 || quarterB === 3 ? 'q-red' : 'q-black') : '';

                                                // 得点種別: 2P=斜め線, FT=黒丸, 3P=選手番号に丸囲み
                                                const isFreeThrowA = entryA?.scoreType === 'FT';
                                                const isFreeThrowB = entryB?.scoreType === 'FT';
                                                const isThreePointA = entryA?.scoreType === '3P';
                                                const isThreePointB = entryB?.scoreType === '3P';

                                                const isQuarterEndA = entryA && scoreHistory
                                                    .filter(s => s.teamId === 'teamA' && s.quarter === quarterA)
                                                    .sort((a, b) => b.timestamp - a.timestamp)[0]?.id === entryA.id;
                                                const isQuarterEndB = entryB && scoreHistory
                                                    .filter(s => s.teamId === 'teamB' && s.quarter === quarterB)
                                                    .sort((a, b) => b.timestamp - a.timestamp)[0]?.id === entryB.id;

                                                const isGameEndA = entryA && scoreHistory
                                                    .filter(s => s.teamId === 'teamA')
                                                    .sort((a, b) => b.timestamp - a.timestamp)[0]?.id === entryA.id;
                                                const isGameEndB = entryB && scoreHistory
                                                    .filter(s => s.teamId === 'teamB')
                                                    .sort((a, b) => b.timestamp - a.timestamp)[0]?.id === entryB.id;

                                                const endClassA = isGameEndA ? 'game-end' : (isQuarterEndA ? 'quarter-end' : '');
                                                const endClassB = isGameEndB ? 'game-end' : (isQuarterEndB ? 'quarter-end' : '');

                                                // 点数のスタイル: FT=filled(●), Q終了/試合終了=circled(○), その他=slashed(斜線)
                                                // FT + Q終了/試合終了の場合は両方を適用（filled + circled）
                                                const scoreStyleA = `${isFreeThrowA ? 'filled' : 'slashed'} ${(isQuarterEndA || isGameEndA) ? 'circled' : ''}`.trim();
                                                const scoreStyleB = `${isFreeThrowB ? 'filled' : 'slashed'} ${(isQuarterEndB || isGameEndB) ? 'circled' : ''}`.trim();

                                                return (
                                                    <div key={scoreVal} className="rs-rs-row">
                                                        <div className={`rs-rs-cell a-no ${endClassA} ${quarterClassA} ${isThreePointA ? 'circled' : ''}`}>
                                                            {entryA ? (entryA.isOwnGoal ? <span style={{ fontSize: '1.2em', lineHeight: 1 }}>▲</span> : (entryA.playerNumber === -1 ? '?' : formatPlayerNumber(entryA.playerNumber))) : ''}
                                                        </div>
                                                        <div className={`rs-rs-cell a-score ${entryA ? `${scoreStyleA} ${quarterClassA}` : ''} ${endClassA} ${quarterClassA}`}>
                                                            {scoreVal}
                                                        </div>
                                                        <div className={`rs-rs-cell b-score ${entryB ? `${scoreStyleB} ${quarterClassB}` : ''} ${endClassB} ${quarterClassB}`}>
                                                            {scoreVal}
                                                        </div>
                                                        <div className={`rs-rs-cell b-no ${endClassB} ${quarterClassB} ${isThreePointB ? 'circled' : ''}`}>
                                                            {entryB ? (entryB.isOwnGoal ? <span style={{ fontSize: '1.2em', lineHeight: 1 }}>▲</span> : (entryB.playerNumber === -1 ? '?' : formatPlayerNumber(entryB.playerNumber))) : ''}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {/* 試合終了後の未使用セル斜線（SVGオーバーレイ） */}
                                            {needSlashA && (
                                                <svg
                                                    className="rs-unused-slash rs-unused-slash-a"
                                                    style={{
                                                        top: `calc(${slashStartRowA} * 5.0mm)`,
                                                        height: `calc(${rowsPerColumn - slashStartRowA} * 5.0mm)`,
                                                    }}
                                                    preserveAspectRatio="none"
                                                >
                                                    <line x1="0" y1="0" x2="100%" y2="100%" />
                                                </svg>
                                            )}
                                            {needSlashB && (
                                                <svg
                                                    className="rs-unused-slash rs-unused-slash-b"
                                                    style={{
                                                        top: `calc(${slashStartRowB} * 5.0mm)`,
                                                        height: `calc(${rowsPerColumn - slashStartRowB} * 5.0mm)`,
                                                    }}
                                                    preserveAspectRatio="none"
                                                >
                                                    <line x1="0" y1="0" x2="100%" y2="100%" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="rs-winner">
                            <span className="rs-result-label">勝利チーム</span>
                            <span className="rs-result-value">{finalScoreA > finalScoreB ? teamA.name : finalScoreB > finalScoreA ? teamB.name : '引き分け'}</span>
                        </div>
                        <div className="rs-game-end-time">
                            <span className="rs-result-label">試合終了時間</span>
                            <span className="rs-result-value">
                                {endTime ? `${new Date(endTime).getHours().toString().padStart(2, '0')}:${new Date(endTime).getMinutes().toString().padStart(2, '0')}` : ''}
                            </span>
                        </div>
                        <div className="rs-jba-credit">
                            公益財団法人日本バスケットボール協会 公式様式に準拠
                            <span className="rs-jba-disclaimer">※本アプリは同協会の公認・提携アプリではありません。</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 試合情報編集モーダル */}
            {showGameInfoModal && (
                <GameInfoModal
                    gameInfo={gameInfo}
                    endTime={endTime}
                    onSave={(info) => onUpdateGameInfo?.(info)}
                    onEndTimeChange={onEndTimeChange}
                    onClose={() => setShowGameInfoModal(false)}
                />
            )}
        </div>
    );
}
