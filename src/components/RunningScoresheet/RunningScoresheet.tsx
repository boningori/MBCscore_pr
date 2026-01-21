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
                {/* ヘッダー */}
                <div className="rs-header">
                    <div className="rs-logo">JBA</div>
                    <h1>MINI-BASKETBALL OFFICIAL SCORESHEET</h1>
                </div>

                {/* 基本情報 */}
                <div className="rs-info-section">
                    <div className="rs-info-row">
                        <div className="rs-info-item">
                            <label>大会名</label>
                            <span className="rs-info-value">{gameName}</span>
                        </div>
                        <div className="rs-info-item small">
                            <label>日付</label>
                            <span className="rs-info-value">{date}</span>
                        </div>
                        <div className="rs-info-item small">
                            <label>試合No</label>
                            <span className="rs-info-value"></span>
                        </div>
                    </div>
                    <div className="rs-info-row">
                        <div className="rs-info-item">
                            <label>会場</label>
                            <span className="rs-info-value"></span>
                        </div>
                    </div>
                </div>

                {/* スコア欄 */}
                <div className="rs-score-section">
                    <div className="rs-score-box">
                        <span className="rs-score-label">スコア</span>
                        <div className="rs-score-teams">
                            <div className="rs-score-team">
                                <span className="rs-team-name">{teamA.name}</span>
                                <span className="rs-team-score">{finalScoreA}</span>
                            </div>
                            <span className="rs-score-vs">-</span>
                            <div className="rs-score-team">
                                <span className="rs-team-name">{teamB.name}</span>
                                <span className="rs-team-score">{finalScoreB}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* メインコンテンツ */}
                <div className="rs-main-content">
                    {/* 左側: チーム情報 */}
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
                                    {/* 空行を追加して15行にする */}
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

                    {/* 右側: ランニングスコア */}
                    <div className="rs-running-score-section">
                        <h3>ランニング スコア</h3>
                        <div className="rs-running-score-grid">
                            {Array.from({ length: 4 }).map((_, colIndex) => { // 4カラム (160点)
                                const rowsPerColumn = 40;
                                const startScore = colIndex * rowsPerColumn + 1;
                                const endScore = startScore + rowsPerColumn - 1;
                                const rows = [];

                                for (let score = startScore; score <= endScore; score++) {
                                    // スコアのエントリを検索
                                    const entryA = scoreHistory.find(s => s.teamId === 'teamA' && s.runningScoreA === score);
                                    const entryB = scoreHistory.find(s => s.teamId === 'teamB' && s.runningScoreB === score);

                                    const quarterA = entryA?.quarter;
                                    const quarterB = entryB?.quarter;
                                    const quarterClassA = quarterA ? (quarterA === 2 || quarterA === 4 ? 'q-red' : 'q-black') : '';
                                    const quarterClassB = quarterB ? (quarterB === 2 || quarterB === 4 ? 'q-red' : 'q-black') : '';

                                    // このクオーターの最後の得点かどうか判定
                                    const isQuarterEndA = entryA && scoreHistory
                                        .filter(s => s.teamId === 'teamA' && s.quarter === quarterA)
                                        .sort((a, b) => b.timestamp - a.timestamp)[0]?.id === entryA.id;
                                    const isQuarterEndB = entryB && scoreHistory
                                        .filter(s => s.teamId === 'teamB' && s.quarter === quarterB)
                                        .sort((a, b) => b.timestamp - a.timestamp)[0]?.id === entryB.id;

                                    rows.push(
                                        <div key={score} className="score-row">
                                            {/* Team A */}
                                            <div className="score-cell player-num-a">
                                                {entryA ? (entryA.playerNumber === -1 ? '?' : entryA.playerNumber) : ''}
                                            </div>
                                            <div className={`score-cell score-val-a ${entryA ? `slashed ${quarterClassA}` : ''} ${isQuarterEndA ? `quarter-end ${quarterClassA}` : ''}`}>
                                                {score}
                                            </div>

                                            {/* Team B */}
                                            <div className={`score-cell score-val-b ${entryB ? `slashed ${quarterClassB}` : ''} ${isQuarterEndB ? `quarter-end ${quarterClassB}` : ''}`}>
                                                {score}
                                            </div>
                                            <div className="score-cell player-num-b">
                                                {entryB ? (entryB.playerNumber === -1 ? '?' : entryB.playerNumber) : ''}
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={colIndex} className="running-score-column">
                                        <div className="column-header">
                                            <div className="col-header-a">A</div>
                                            <div className="col-header-b">B</div>
                                        </div>
                                        <div className="column-body">
                                            {rows}
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
        </div >
    );
}
