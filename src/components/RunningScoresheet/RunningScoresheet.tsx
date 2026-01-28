import { useRef } from 'react';
import type { Game } from '../../types/game';
import { formatFoulDisplay } from '../../types/game';
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

    const renderPlayerRow = (player: typeof teamA.players[0], index: number) => (
        <tr key={player.id}>
            <td className="cell-no">{index + 1}</td>
            <td className="cell-license"></td>
            <td className="cell-name">{player.name}</td>
            <td className="cell-number">{player.number}</td>
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
            {[0, 1, 2, 3, 4].map(f => (
                <td key={f} className="cell-foul">
                    {player.fouls[f] ? formatFoulDisplay(player.fouls[f]) : ''}
                </td>
            ))}
        </tr>
    );

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
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['1Q'].A}</span><span className="sep">―</span><span className="val">{scoresByPeriod['1Q'].B}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['2Q'].A}</span><span className="sep">―</span><span className="val">{scoresByPeriod['2Q'].B}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['3Q'].A}</span><span className="sep">―</span><span className="val">{scoresByPeriod['3Q'].B}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['4Q'].A}</span><span className="sep">―</span><span className="val">{scoresByPeriod['4Q'].B}</span></div>
                                    <div className="rs-sb-row"><span className="val">{scoresByPeriod['OT'].A}</span><span className="sep ot-label">(延長)</span><span className="val">{scoresByPeriod['OT'].B}</span></div>
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

                {/* Main Content (3 Column Layout: Teams | Center | Running Score) */}
                <div className="rs-main-content">
                    {/* Left Column: Teams */}
                    <div className="rs-teams-section">
                        {[teamA, teamB].map((team, tIndex) => (
                            <div key={team.id} className="rs-team-block">
                                {/* Header: Name & Timeouts */}
                                <div className="rs-team-header-row">
                                    <div className="rs-team-name-area">
                                        <div className="team-name-row">
                                            <span className="rs-team-label">{tIndex === 0 ? 'チームA：' : 'チームB：'}</span>
                                            <span className="team-name-label">{team.name}</span>
                                        </div>
                                        <div className="team-name-sub">{tIndex === 0 ? 'Team A' : 'Team B'}</div>
                                        <div className="team-category-paren">（{team.color === 'white' ? '白' : '青'}）</div>
                                    </div>
                                    <div className="rs-team-timeout-area">
                                        <div className="timeout-header">タイムアウト</div>
                                        <div className="timeout-grid">
                                            <div className="to-cell-label">①</div>
                                            <div className="to-cell-label">②</div>
                                            <div className="to-cell-label">③</div>
                                            <div className="to-cell-label">④</div>
                                            <div className="to-cell-label">OT</div>
                                            <div className={`to-cell-val ${team.timeouts.some(t => t.quarter === 1) ? 'to-marked q-red' : ''}`}></div>
                                            <div className={`to-cell-val ${team.timeouts.some(t => t.quarter === 2) ? 'to-marked q-black' : ''}`}></div>
                                            <div className={`to-cell-val ${team.timeouts.some(t => t.quarter === 3) ? 'to-marked q-red' : ''}`}></div>
                                            <div className={`to-cell-val ${team.timeouts.some(t => t.quarter === 4) ? 'to-marked q-black' : ''}`}></div>
                                            <div className={`to-cell-val ot ${team.timeouts.some(t => t.quarter > 4) ? 'to-marked q-black' : ''}`}></div>
                                        </div>
                                    </div>
                                </div>

                                <table className="rs-roster-table">
                                    <thead>
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
                                        {team.players.slice(0, 15).map((p, i) => renderPlayerRow(p, i))}
                                        {Array.from({ length: Math.max(0, 15 - team.players.length) }).map((_, i) => (
                                            <tr key={`empty-${team.id}-${i}`}>
                                                <td className="cell-no">{team.players.length + i + 1}</td>
                                                <td className="cell-license"></td>
                                                <td className="cell-name"></td>
                                                <td className="cell-number"></td>
                                                {[1, 2, 3, 4].map(q => <td key={q} className="cell-quarter"></td>)}
                                                {[1, 2, 3, 4, 5].map(f => <td key={f} className="cell-foul"></td>)}
                                            </tr>
                                        ))}
                                        {/* Coach Rows */}
                                        <tr className="coach-row">
                                            <td colSpan={2} className="coach-label">コーチ:</td>
                                            <td colSpan={6} className="coach-name">{team.coachName}</td>
                                            {[0, 1, 2].map(i => {
                                                const f = team.coachFouls[i];
                                                const display = f === 'T' ? 'C' : f === 'BT' ? 'B' : f || '';
                                                return <td key={i} className="cell-foul">{display}</td>;
                                            })}
                                            <td className="cell-foul"></td>
                                            <td className="cell-foul"></td>
                                        </tr>
                                        <tr className="coach-row">
                                            <td colSpan={2} className="coach-label">A.コーチ:</td>
                                            <td colSpan={6} className="coach-name">{team.assistantCoachName}</td>
                                            <td className="cell-foul"></td>
                                            <td className="cell-foul"></td>
                                            <td className="cell-foul"></td>
                                            <td className="cell-foul"></td>
                                            <td className="cell-foul"></td>
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
                                        {[1, 2, 3, 4].map(num => [
                                            <div key={`${team.id}-1q-${num}`} className={`rs-tf-cell ${team.teamFouls[0] >= num ? 'marked q-red' : ''}`}>{num}</div>,
                                            <div key={`${team.id}-2q-${num}`} className={`rs-tf-cell ${team.teamFouls[1] >= num ? 'marked q-black' : ''}`}>{num}</div>
                                        ])}
                                    </div>
                                </div>
                                <div className="rs-tf-grid-group">
                                    <div className="rs-tf-grid">
                                        <div className="rs-tf-header-cell">3Q</div>
                                        <div className="rs-tf-header-cell">4Q</div>
                                        {[1, 2, 3, 4].map(num => [
                                            <div key={`${team.id}-3q-${num}`} className={`rs-tf-cell ${team.teamFouls[2] >= num ? 'marked q-red' : ''}`}>{num}</div>,
                                            <div key={`${team.id}-4q-${num}`} className={`rs-tf-cell ${team.teamFouls[3] >= num ? 'marked q-black' : ''}`}>{num}</div>
                                        ])}
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
                                                            {entryA ? (entryA.playerNumber === -1 ? '?' : entryA.playerNumber) : ''}
                                                        </div>
                                                        <div className={`rs-rs-cell a-score ${entryA ? `${scoreStyleA} ${quarterClassA}` : ''} ${endClassA} ${quarterClassA}`}>
                                                            {scoreVal}
                                                        </div>
                                                        <div className={`rs-rs-cell b-score ${entryB ? `${scoreStyleB} ${quarterClassB}` : ''} ${endClassB} ${quarterClassB}`}>
                                                            {scoreVal}
                                                        </div>
                                                        <div className={`rs-rs-cell b-no ${endClassB} ${quarterClassB} ${isThreePointB ? 'circled' : ''}`}>
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
                            <span className="rs-result-label">勝利チーム</span>
                            <span className="rs-result-value">{finalScoreA > finalScoreB ? teamA.name : finalScoreB > finalScoreA ? teamB.name : '引き分け'}</span>
                        </div>
                        <div className="rs-game-end-time">
                            <span className="rs-result-label">試合終了時間</span>
                            <span className="rs-result-value"></span>
                        </div>
                        <div className="rs-jba-credit">公益財団法人日本バスケットボール協会</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
