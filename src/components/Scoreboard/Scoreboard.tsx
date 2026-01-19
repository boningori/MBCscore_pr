import { useGame } from '../../context/GameContext';
import './Scoreboard.css';

interface ScoreboardProps {
    onQuarterEnd?: () => void;
    onTimeout?: (teamId: 'teamA' | 'teamB') => void;
    mode?: 'full' | 'simple';
}

export function Scoreboard({ onQuarterEnd, onTimeout, mode = 'full' }: ScoreboardProps) {
    const { state, dispatch, getTeamScore } = useGame();
    const { currentQuarter, phase } = state;

    const handleQuarterManagement = () => {
        if (phase === 'playing' || phase === 'setup') {
            if (onQuarterEnd) {
                onQuarterEnd();
            } else {
                dispatch({ type: 'END_QUARTER' });
            }
        } else if (phase === 'quarterEnd') {
            if (currentQuarter < 4) {
                dispatch({ type: 'START_GAME' });
            } else {
                dispatch({ type: 'END_GAME' });
            }
        }
    };

    const scoreA = getTeamScore('teamA');
    const scoreB = getTeamScore('teamB');

    // シンプルモード用のコンパクトレイアウト
    if (mode === 'simple') {
        return (
            <div className="scoreboard-new scoreboard-simple">
                <div className="scoreboard-simple-grid">
                    {/* チームA */}
                    <div className={`simple-team-card color-${state.teamA.color}`}>
                        <div className="simple-team-header">
                            <span className="simple-team-name">{state.teamA.name}</span>
                            <span className="simple-team-score">{scoreA}</span>
                        </div>
                        <div className="simple-team-footer">
                            <span className={`quarter-badge q${currentQuarter}`}>Q{currentQuarter}</span>
                            <span className={`tf-badge ${state.teamA.teamFouls[currentQuarter - 1] >= 4 ? 'bonus' : ''}`}>
                                TF {state.teamA.teamFouls[currentQuarter - 1]}
                            </span>
                            {phase === 'playing' && (
                                <button className="btn btn-secondary btn-small" onClick={handleQuarterManagement}>
                                    Q終了
                                </button>
                            )}
                            {phase === 'quarterEnd' && (
                                <button className="btn btn-primary btn-small" onClick={handleQuarterManagement}>
                                    {currentQuarter < 4 ? `Q${currentQuarter + 1}へ` : '終了'}
                                </button>
                            )}
                            {phase === 'setup' && (
                                <button className="btn btn-primary btn-small" onClick={() => dispatch({ type: 'START_GAME' })}>
                                    開始
                                </button>
                            )}
                        </div>
                    </div>

                    {/* チームB */}
                    <div className={`simple-team-card color-${state.teamB.color}`}>
                        <div className="simple-team-header">
                            <span className="simple-team-name">{state.teamB.name}</span>
                            <span className="simple-team-score">{scoreB}</span>
                        </div>
                        <div className="simple-team-footer">
                            <span className={`quarter-badge q${currentQuarter}`}>Q{currentQuarter}</span>
                            <span className={`tf-badge ${state.teamB.teamFouls[currentQuarter - 1] >= 4 ? 'bonus' : ''}`}>
                                TF {state.teamB.teamFouls[currentQuarter - 1]}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="scoreboard-new">
            {/* Row 1: スコア表示 */}
            <div className="scoreboard-main">
                {/* チームA */}
                <div className={`team-score-block team-a-block color-${state.teamA.color}`}>
                    <div className="team-info">
                        <span className="team-label">{state.teamA.name}</span>
                        <span className="team-color-badge">{state.teamA.color === 'white' ? '白' : '青'}</span>
                    </div>
                    <div className="score-display">{scoreA}</div>
                </div>

                {/* クォーター表示 */}
                <div className="quarter-section">
                    <span className={`quarter-badge-large q${currentQuarter}`}>Q{currentQuarter}</span>
                    <div className="quarter-controls">
                        {phase === 'playing' && (
                            <button className="btn btn-secondary btn-small" onClick={handleQuarterManagement}>
                                Q終了
                            </button>
                        )}
                        {phase === 'quarterEnd' && (
                            <button className="btn btn-primary btn-small" onClick={handleQuarterManagement}>
                                {currentQuarter < 4 ? `Q${currentQuarter + 1}へ` : '試合終了'}
                            </button>
                        )}
                        {phase === 'setup' && (
                            <button className="btn btn-primary btn-small" onClick={() => dispatch({ type: 'START_GAME' })}>
                                試合開始
                            </button>
                        )}
                    </div>
                </div>

                {/* チームB */}
                <div className={`team-score-block team-b-block color-${state.teamB.color}`}>
                    <div className="team-info">
                        <span className="team-label">{state.teamB.name}</span>
                        <span className="team-color-badge">{state.teamB.color === 'white' ? '白' : '青'}</span>
                    </div>
                    <div className="score-display">{scoreB}</div>
                </div>
            </div>

            {/* Row 2: チームファウル & タイムアウト */}
            <div className="scoreboard-stats">
                {/* チームA情報 */}
                <div className="team-stats-block">
                    <div className={`stat-item tf-count ${state.teamA.teamFouls[currentQuarter - 1] >= 4 ? 'bonus' : ''}`}>
                        <span className="stat-label">TF</span>
                        <span className="stat-value">{state.teamA.teamFouls[currentQuarter - 1]}</span>
                    </div>
                    <div className="stat-item to-count">
                        <span className="stat-label">TO</span>
                        <span className="stat-value">{state.teamA.timeouts.length}/3</span>
                    </div>
                    {phase === 'playing' && onTimeout && (
                        <button
                            className="btn btn-small btn-game-action"
                            onClick={() => onTimeout('teamA')}
                            disabled={state.teamA.timeouts.length >= 3}
                        >
                            タイムアウト
                        </button>
                    )}
                </div>

                {/* チームB情報 */}
                <div className="team-stats-block">
                    <div className={`stat-item tf-count ${state.teamB.teamFouls[currentQuarter - 1] >= 4 ? 'bonus' : ''}`}>
                        <span className="stat-label">TF</span>
                        <span className="stat-value">{state.teamB.teamFouls[currentQuarter - 1]}</span>
                    </div>
                    <div className="stat-item to-count">
                        <span className="stat-label">TO</span>
                        <span className="stat-value">{state.teamB.timeouts.length}/3</span>
                    </div>
                    {phase === 'playing' && onTimeout && (
                        <button
                            className="btn btn-small btn-game-action"
                            onClick={() => onTimeout('teamB')}
                            disabled={state.teamB.timeouts.length >= 3}
                        >
                            タイムアウト
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
