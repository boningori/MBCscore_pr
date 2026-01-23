import { useGame } from '../../context/GameContext';
import type { Team, ScoreEntry } from '../../types/game';
import { formatFoulDisplay } from '../../types/game';
import './OfficialScoresheet.css';

interface OfficialScoresheetProps {
    data?: {
        teamA: Team;
        teamB: Team;
        scoreHistory: ScoreEntry[];
    };
}

export function OfficialScoresheet({ data }: OfficialScoresheetProps) {
    const { state } = useGame();

    const teamA = data?.teamA || state.teamA;
    const teamB = data?.teamB || state.teamB;
    const scoreHistory = data?.scoreHistory || state.scoreHistory;

    // Running Score Map
    const scoreMap = new Map<string, ScoreEntry>();
    scoreHistory.forEach(entry => {
        const key = entry.teamId === 'teamA' ? `teamA-${entry.runningScoreA}` : `teamB-${entry.runningScoreB}`;
        scoreMap.set(key, entry);
    });

    const scoreA = teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
    const scoreB = teamB.players.reduce((sum, p) => sum + p.stats.points, 0);

    // Running Score Rows (1-40 per column pair)
    const renderRunningScoreBlock = (startNum: number, endNum: number) => {
        const rows = [];
        for (let i = startNum; i <= endNum; i++) {
            const entryA = scoreMap.get(`teamA-${i}`);
            const entryB = scoreMap.get(`teamB-${i}`);
            rows.push(
                <tr key={i}>
                    <td className={entryA ? 'scored' : ''}>{i}</td>
                    <td className={entryB ? 'scored' : ''}>{i}</td>
                </tr>
            );
        }
        return rows;
    };

    return (
        <div className="jba-scoresheet">
            {/* Header */}
            <div className="jba-header">
                <div className="jba-logo">JBA</div>
                <div className="jba-title">MINI-BASKETBALL OFFICIAL SCORESHEET</div>
            </div>

            {/* Info Row */}
            <div className="jba-info-row">
                <div className="info-cell">大会名</div>
                <div className="info-cell">日付<span className="small-text">年　月</span></div>
                <div className="info-cell">開始:</div>
                <div className="info-cell">Game No.</div>
            </div>
            <div className="jba-info-row">
                <div className="info-cell">会場</div>
                <div className="info-cell">クルーチーフ</div>
                <div className="info-cell">アンパイア</div>
            </div>

            {/* Score Summary */}
            <div className="jba-score-summary">
                <div className="score-label">スコア<br /><span className="en">Score</span></div>
                <div className="score-team-col">
                    <div className="score-team-header">チームA</div>
                    <div className="score-box">-</div>
                </div>
                <div className="score-team-col">
                    <div className="score-team-header">チームB</div>
                    <div className="score-box">-</div>
                </div>
                <div className="score-officials">
                    <div>A スコアラー</div>
                    <div>タイマー</div>
                </div>
            </div>

            {/* Main Body */}
            <div className="jba-main-body">
                {/* Left: Team Sections */}
                <div className="jba-teams-section">
                    {/* Team A */}
                    <TeamSection team={teamA} label="A" />
                    {/* Team B */}
                    <TeamSection team={teamB} label="B" />
                </div>

                {/* Right: Running Score */}
                <div className="jba-running-score">
                    <div className="running-header">ランニング スコア<br /><span className="en">RUNNING SCORE</span></div>
                    <div className="running-columns">
                        <table className="running-table">
                            <thead>
                                <tr><th>A</th><th>B</th></tr>
                            </thead>
                            <tbody>
                                {renderRunningScoreBlock(1, 40)}
                            </tbody>
                        </table>
                        <table className="running-table">
                            <thead>
                                <tr><th>A</th><th>B</th></tr>
                            </thead>
                            <tbody>
                                {renderRunningScoreBlock(41, 80)}
                            </tbody>
                        </table>
                        <table className="running-table">
                            <thead>
                                <tr><th>A</th><th>B</th></tr>
                            </thead>
                            <tbody>
                                {renderRunningScoreBlock(81, 120)}
                            </tbody>
                        </table>
                    </div>
                    <div className="running-footer">
                        <div>勝利チーム</div>
                        <div>試合終了時間</div>
                    </div>
                </div>
            </div>

            {/* Footer with final score */}
            <div className="jba-footer">
                最終スコア: {teamA.name} {scoreA} - {scoreB} {teamB.name}
            </div>
        </div>
    );
}

function TeamSection({ team, label }: { team: Team, label: string }) {
    const MAX_PLAYERS = 15;
    const players = [...team.players];
    while (players.length < MAX_PLAYERS) {
        players.push({ id: `empty-${players.length}`, number: '' as any, name: '', fouls: [], stats: {} as any, isOnCourt: false, isCaptain: false, quartersPlayed: [false, false, false, false] });
    }

    return (
        <div className="team-block">
            <div className="team-header-row">
                <div className="team-label">チーム{label}:<br /><span className="en">Team {label}</span></div>
                <div className="team-name-box">{team.name}</div>
                <div className="timeout-section">
                    <span className="timeout-label">タイムアウト</span>
                    <div className="timeout-boxes">
                        <span className="timeout-box">{team.timeouts.length >= 1 ? '✓' : ''}</span>
                        <span className="timeout-circles">
                            <span className="circle">{team.timeouts.length >= 1 ? '①' : '①'}</span>
                            <span className="circle">{team.timeouts.length >= 2 ? '②' : '②'}</span>
                            <span className="circle">{team.timeouts.length >= 3 ? '③' : '③'}</span>
                        </span>
                        <span className="ot-label">OT</span>
                    </div>
                </div>
            </div>

            <div className="team-table-container">
                <table className="players-table">
                    <thead>
                        <tr>
                            <th rowSpan={2}>No.</th>
                            <th rowSpan={2}>ライセンスNo.</th>
                            <th rowSpan={2}>選手氏名<br /><span className="en">Players</span></th>
                            <th rowSpan={2}>No.</th>
                            <th colSpan={4}>出場時限</th>
                            <th colSpan={4}>ファウル</th>
                        </tr>
                        <tr>
                            <th>①</th><th>②</th><th>③</th><th>④</th>
                            <th>1</th><th>2</th><th>3</th><th>4</th>
                        </tr>
                    </thead>
                    <tbody>
                        {players.slice(0, MAX_PLAYERS).map((p, idx) => (
                            <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td></td>
                                <td className="player-name">{p.name}</td>
                                <td>{p.number}</td>
                                <td>{p.quartersPlayed?.[0] ? '✓' : ''}</td>
                                <td>{p.quartersPlayed?.[1] ? '✓' : ''}</td>
                                <td>{p.quartersPlayed?.[2] ? '✓' : ''}</td>
                                <td>{p.quartersPlayed?.[3] ? '✓' : ''}</td>
                                <td>{p.fouls?.[0] ? formatFoulDisplay(p.fouls[0]) : ''}</td>
                                <td>{p.fouls?.[1] ? formatFoulDisplay(p.fouls[1]) : ''}</td>
                                <td>{p.fouls?.[2] ? formatFoulDisplay(p.fouls[2]) : ''}</td>
                                <td>{p.fouls?.[3] ? formatFoulDisplay(p.fouls[3]) : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Team Fouls Section */}
                <div className="team-fouls-section">
                    <div className="team-fouls-label">チーム<br />ファウル</div>
                    <div className="team-fouls-grid">
                        <div className="foul-quarter-row">
                            <span>1Q</span><span>2Q</span>
                        </div>
                        <div className="foul-boxes-row">
                            {[0, 1, 2, 3].map(i => (
                                <span key={`1q-${i}`} className={`foul-box ${(team.teamFouls[0] || 0) > i ? 'filled' : ''}`}>{i + 1}</span>
                            ))}
                        </div>
                        <div className="foul-boxes-row">
                            {[0, 1, 2, 3].map(i => (
                                <span key={`2q-${i}`} className={`foul-box ${(team.teamFouls[1] || 0) > i ? 'filled' : ''}`}>{i + 1}</span>
                            ))}
                        </div>
                        <div className="foul-quarter-row">
                            <span>3Q</span><span>4Q</span>
                        </div>
                        <div className="foul-boxes-row">
                            {[0, 1, 2, 3].map(i => (
                                <span key={`3q-${i}`} className={`foul-box ${(team.teamFouls[2] || 0) > i ? 'filled' : ''}`}>{i + 1}</span>
                            ))}
                        </div>
                        <div className="foul-boxes-row">
                            {[0, 1, 2, 3].map(i => (
                                <span key={`4q-${i}`} className={`foul-box ${(team.teamFouls[3] || 0) > i ? 'filled' : ''}`}>{i + 1}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="coach-row">
                <span className="coach-label">コーチ:</span>
                <span className="coach-name">{team.coachName}</span>
                <div className="coach-fouls">
                    {team.coachFouls.map((foul, i) => (
                        <span key={i} className="foul-box filled">
                            {foul === 'T' ? 'C' : foul === 'BT' ? 'B' : foul}
                        </span>
                    ))}
                </div>
            </div>
            <div className="coach-row">
                <span className="coach-label">Aコーチ:</span>
                <span className="coach-name">{team.assistantCoachName}</span>
            </div>
        </div>
    );
}
