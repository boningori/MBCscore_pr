import { useRef } from 'react';
import type { Team, Game } from '../../types/game';
import { exportElement, generateScoresheetFilename } from '../../utils/pdfExport';
import './RunningScoresheet.css';

interface RunningScoresheetProps {
    game: Game;
    gameName?: string;
    date?: string;
    onClose?: () => void;
}

export function RunningScoresheet({ game, gameName = '', date = '', onClose }: RunningScoresheetProps) {
    const scoresheetRef = useRef<HTMLDivElement>(null);

    const { teamA, teamB, scoreHistory } = game;

    // PDF出力
    const handleExportPDF = async () => {
        if (!scoresheetRef.current) return;
        const filename = generateScoresheetFilename(gameName, date, teamA.name, teamB.name);
        await exportElement(scoresheetRef.current, { filename, format: 'pdf' });
    };

    // JPEG出力
    const handleExportJPEG = async () => {
        if (!scoresheetRef.current) return;
        const filename = generateScoresheetFilename(gameName, date, teamA.name, teamB.name);
        await exportElement(scoresheetRef.current, { filename, format: 'jpeg' });
    };

    // 最終スコア
    const finalScoreA = teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
    const finalScoreB = teamB.players.reduce((sum, p) => sum + p.stats.points, 0);

    // Placeholder for Period Scores logic - defaulting to empty for display
    const scoresByPeriod: { [key: string]: { A: string | number, B: string | number } } = {
        '1Q': { A: '', B: '' },
        '2Q': { A: '', B: '' },
        '3Q': { A: '', B: '' },
        '4Q': { A: '', B: '' },
        'OT': { A: '', B: '' }
    };

    const renderPlayerRow = (player: typeof teamA.players[0], index: number) => (
        <tr key={player.id}>
            <td className="cell-no">{index + 1}</td>
            <td className="cell-license"></td>
            <td className="cell-name">{player.name}</td>
            <td className="cell-number">{player.number}</td>
            {[1, 2, 3, 4].map(q => (
                <td key={q} className="cell-quarter">
                    {player.quartersPlayed[q - 1] ? '✓' : ''}
                </td>
            ))}
            {[0, 1, 2, 3, 4].map(f => (
                <td key={f} className="cell-foul">
                    {player.fouls[f] || ''}
                </td>
            ))}
        </tr>
    );

    const renderTeamFoulRow = (team: Team, quarter: number) => {
        const fouls = team.teamFouls[quarter - 1] || 0;
        return (
            <div className="team-foul-row">
                {[1, 2, 3, 4].map(f => (
                    <span key={f} className={`foul-box ${f <= fouls ? 'marked' : ''}`}>
                        {f}
                    </span>
                ))}
            </div>
        );
    };

    return (
        <div className="running-scoresheet-container">
            {/* ツールバー */}
            <div className="scoresheet-toolbar">
                <button className="btn btn-primary" onClick={handleExportPDF}>
                    PDF出力
                </button>
                <button className="btn btn-secondary" onClick={handleExportJPEG}>
                    JPEG出力
                </button>
                {onClose && (
                    <button className="btn btn-secondary" onClick={onClose}>
                        閉じる
                    </button>
                )}
            </div>

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
                            <label>大会名</label>
                            <span className="rs-competition-value">{gameName}</span>
                        </div>
                        <div className="rs-game-info-box">
                            <div className="rs-date-time-row">
                                <div className="rs-date-box">
                                    <label>日付</label>
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
                                    <label>時間</label>
                                    <span>:</span>
                                </div>
                            </div>
                            <div className="rs-place-game-row">
                                <div className="rs-place-box">
                                    <label>会場</label>
                                    <span className="rs-place-val"></span>
                                </div>
                                <div className="rs-game-no-box">
                                    <label>Game No.</label>
                                    <span></span>
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
                                <div className="rs-brace">{'\{'}</div>
                                {/* Center Breakdown: Q1-Q4, OT */}
                                <div className="rs-score-breakdown">
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['1Q']?.A || '-'}</span><span className="sep">-</span><span className="val">{scoresByPeriod['1Q']?.B || '-'}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['2Q']?.A || '-'}</span><span className="sep">-</span><span className="val">{scoresByPeriod['2Q']?.B || '-'}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['3Q']?.A || '-'}</span><span className="sep">-</span><span className="val">{scoresByPeriod['3Q']?.B || '-'}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['4Q']?.A || '-'}</span><span className="sep">-</span><span className="val">{scoresByPeriod['4Q']?.B || '-'}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['OT']?.A || '-'}</span><span className="sep">(延長)</span><span className="val">{scoresByPeriod['OT']?.B || '-'}</span></div>
                                </div>
                                <div className="rs-brace">{'\}'}</div>
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
                                <div className="rs-official-cell value-cell"></div>
                                <div className="rs-official-cell label-cell">アンパイア</div>
                                <div className="rs-official-cell value-cell"></div>
                            </div>
                            <div className="rs-official-row">
                                <div className="rs-official-cell label-cell">スコアラー</div>
                                <div className="rs-official-cell value-cell"></div>
                                <div className="rs-official-cell label-cell">タイマー</div>
                                <div className="rs-official-cell value-cell"></div>
                            </div>
                            <div className="rs-official-row">
                                <div className="rs-official-cell label-cell">A・スコアラー</div>
                                <div className="rs-official-cell value-cell"></div>
                                <div className="rs-official-cell label-cell">ショットクロックオペレーター</div>
                                <div className="rs-official-cell value-cell"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content (Grid Layout: Left Column vs Right Column) */}
                <div className="rs-main-content">
                    {/* Left Column: Teams */}
                    <div className="rs-teams-section">
                        {/* チームA */}
                        <div className="rs-team-block">
                            <div className="rs-team-header">
                                <span className="rs-team-title">チームA: {teamA.name}</span>
                                <div className="rs-timeout">
                                    <span>タイムアウト</span>
                                    <div className="timeout-marks">
                                        {[1, 2, 3].map(t => (
                                            <span key={t} className={`timeout-circle ${teamA.timeouts.length >= t ? 'used' : ''}`}>
                                                {t}
                                            </span>
                                        ))}
                                        <span className="timeout-ot">OT</span>
                                    </div>
                                </div>
                            </div>
                            <table className="rs-roster-table">
                                <thead>
                                    <tr>
                                        <th>No.</th>
                                        <th>ライセンスNo.</th>
                                        <th>選手氏名</th>
                                        <th>背番号</th>
                                        <th colSpan={4}>出場時限</th>
                                        <th colSpan={5}>ファウル</th>
                                    </tr>
                                    <tr className="sub-header">
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        {[1, 2, 3, 4].map(q => <th key={q}>{q}</th>)}
                                        {[1, 2, 3, 4, 5].map(f => <th key={f}>{f}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {teamA.players.slice(0, 15).map((p, i) => renderPlayerRow(p, i))}
                                    {Array.from({ length: Math.max(0, 15 - teamA.players.length) }).map((_, i) => (
                                        <tr key={`empty-a-${i}`}>
                                            <td className="cell-no">{teamA.players.length + i + 1}</td>
                                            <td className="cell-license"></td>
                                            <td className="cell-name"></td>
                                            <td className="cell-number"></td>
                                            {[1, 2, 3, 4].map(q => <td key={q} className="cell-quarter"></td>)}
                                            {[1, 2, 3, 4, 5].map(f => <td key={f} className="cell-foul"></td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="rs-coach-row">
                                <span className="rs-coach-label">HC: {teamA.coachName}</span>
                                <div className="rs-coach-fouls">
                                    {teamA.coachFouls.map((foul, i) => (
                                        <span key={i} className="rs-foul-mark">
                                            {foul === 'T' ? 'C' : foul === 'BT' ? 'B' : foul}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="rs-coach-row">
                                <span className="rs-coach-label">AC: {teamA.assistantCoachName}</span>
                            </div>
                            <div className="rs-team-fouls">
                                <span>チームファウル:</span>
                                <div className="quarter-fouls">
                                    {[1, 2, 3, 4].map(q => (
                                        <div key={q} className="quarter-foul-box">
                                            <span className="q-label">{q}Q</span>
                                            {renderTeamFoulRow(teamA, q)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* チームB */}
                        <div className="rs-team-block">
                            <div className="rs-team-header">
                                <span className="rs-team-title">チームB: {teamB.name}</span>
                                <div className="rs-timeout">
                                    <span>タイムアウト</span>
                                    <div className="timeout-marks">
                                        {[1, 2, 3].map(t => (
                                            <span key={t} className={`timeout-circle ${teamB.timeouts.length >= t ? 'used' : ''}`}>
                                                {t}
                                            </span>
                                        ))}
                                        <span className="timeout-ot">OT</span>
                                    </div>
                                </div>
                            </div>
                            <table className="rs-roster-table">
                                <thead>
                                    <tr>
                                        <th>No.</th>
                                        <th>ライセンスNo.</th>
                                        <th>選手氏名</th>
                                        <th>背番号</th>
                                        <th colSpan={4}>出場時限</th>
                                        <th colSpan={5}>ファウル</th>
                                    </tr>
                                    <tr className="sub-header">
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        <th></th>
                                        {[1, 2, 3, 4].map(q => <th key={q}>{q}</th>)}
                                        {[1, 2, 3, 4, 5].map(f => <th key={f}>{f}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {teamB.players.slice(0, 15).map((p, i) => renderPlayerRow(p, i))}
                                    {Array.from({ length: Math.max(0, 15 - teamB.players.length) }).map((_, i) => (
                                        <tr key={`empty-b-${i}`}>
                                            <td className="cell-no">{teamB.players.length + i + 1}</td>
                                            <td className="cell-license"></td>
                                            <td className="cell-name"></td>
                                            <td className="cell-number"></td>
                                            {[1, 2, 3, 4].map(q => <td key={q} className="cell-quarter"></td>)}
                                            {[1, 2, 3, 4, 5].map(f => <td key={f} className="cell-foul"></td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="rs-coach-row">
                                <span className="rs-coach-label">HC: {teamB.coachName}</span>
                                <div className="rs-coach-fouls">
                                    {teamB.coachFouls.map((foul, i) => (
                                        <span key={i} className="rs-foul-mark">
                                            {foul === 'T' ? 'C' : foul === 'BT' ? 'B' : foul}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="rs-coach-row">
                                <span className="rs-coach-label">AC: {teamB.assistantCoachName}</span>
                            </div>
                            <div className="rs-team-fouls">
                                <span>チームファウル:</span>
                                <div className="quarter-fouls">
                                    {[1, 2, 3, 4].map(q => (
                                        <div key={q} className="quarter-foul-box">
                                            <span className="q-label">{q}Q</span>
                                            {renderTeamFoulRow(teamB, q)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
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
                                                const quarterClassA = quarterA ? (quarterA === 2 || quarterA === 4 ? 'q-red' : 'q-black') : '';
                                                const quarterClassB = quarterB ? (quarterB === 2 || quarterB === 4 ? 'q-red' : 'q-black') : '';

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

                                                return (
                                                    <div key={scoreVal} className="rs-rs-row">
                                                        <div className={`rs-rs-cell a-no ${endClassA} ${quarterClassA}`}>
                                                            {entryA ? (entryA.playerNumber === -1 ? '?' : entryA.playerNumber) : ''}
                                                        </div>
                                                        <div className={`rs-rs-cell a-score ${entryA ? `slashed ${quarterClassA}` : ''} ${endClassA} ${quarterClassA}`}>
                                                            {scoreVal}
                                                        </div>
                                                        <div className={`rs-rs-cell b-score ${entryB ? `slashed ${quarterClassB}` : ''} ${endClassB} ${quarterClassB}`}>
                                                            {scoreVal}
                                                        </div>
                                                        <div className={`rs-rs-cell b-no ${endClassB} ${quarterClassB}`}>
                                                            {entryB ? (entryB.playerNumber === -1 ? '?' : entryB.playerNumber) : ''}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="rs-winner">
                            <span>勝利チーム: {finalScoreA > finalScoreB ? teamA.name : finalScoreB > finalScoreA ? teamB.name : '引き分け'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
