import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { TimeoutInputModal } from '../TimeoutInputModal/TimeoutInputModal';
import { Modal } from '../Modal';
import './Scoreboard.css';

interface ScoreboardProps {
    onQuarterEnd?: () => void;
    /** quarterEnd中にスタメン選択画面へ戻る導線（未指定なら表示しない） */
    onOpenLineup?: () => void;
    onTimeout?: (teamId: 'teamA' | 'teamB', elapsedMinutes: number) => void;
    mode?: 'full' | 'simple';
}

export function Scoreboard({ onQuarterEnd, onOpenLineup, onTimeout, mode = 'full' }: ScoreboardProps) {
    const { state, dispatch, getTeamScore } = useGame();

    // タイムアウト入力モーダルの状態
    const [timeoutModalOpen, setTimeoutModalOpen] = useState(false);
    const [timeoutTeamId, setTimeoutTeamId] = useState<'teamA' | 'teamB'>('teamA');

    // タイムアウトボタン押下時
    const handleTimeoutClick = (teamId: 'teamA' | 'teamB') => {
        setTimeoutTeamId(teamId);
        setTimeoutModalOpen(true);
    };

    // モーダルで確定時
    const handleTimeoutConfirm = (elapsedMinutes: number) => {
        setTimeoutModalOpen(false);
        if (onTimeout) {
            onTimeout(timeoutTeamId, elapsedMinutes);
        }
    };

    // モーダルでキャンセル時
    const handleTimeoutCancel = () => {
        setTimeoutModalOpen(false);
    };
    const { currentQuarter, phase } = state;

    const quarterLabel = currentQuarter <= 4
        ? `Q${currentQuarter}`
        : currentQuarter === 5 ? 'OT' : `OT${currentQuarter - 4}`;

    // クォーター終了の確認モーダル（Q1〜Q3のみ。Q4以降はApp側の試合終了確認が兼ねる）
    const [showQuarterEndConfirm, setShowQuarterEndConfirm] = useState(false);

    const executeQuarterEnd = () => {
        if (onQuarterEnd) {
            onQuarterEnd();
        } else {
            dispatch({ type: 'END_QUARTER' });
        }
    };

    const handleQuarterManagement = () => {
        if (phase === 'playing' || phase === 'setup') {
            if (currentQuarter < 4) {
                setShowQuarterEndConfirm(true);
            } else {
                executeQuarterEnd();
            }
        } else if (phase === 'quarterEnd') {
            dispatch({ type: 'START_GAME' });
        }
    };

    // クォーター終了の取り消し（新Qとして記録済みのエントリがある場合は不可）
    const canUndoQuarterEnd = phase === 'quarterEnd' && currentQuarter > 1 &&
        !state.scoreHistory.some(e => e.quarter === currentQuarter) &&
        !state.statHistory.some(e => e.quarter === currentQuarter) &&
        !state.foulHistory.some(e => e.quarter === currentQuarter);

    const handleUndoQuarterEnd = () => {
        dispatch({ type: 'UNDO_QUARTER_END' });
    };

    // 確認モーダル（両モード共通）
    const quarterEndConfirmModal = showQuarterEndConfirm && (
        <Modal
            onClose={() => setShowQuarterEndConfirm(false)}
            contentClassName="modal-content end-game-confirm-modal"
            labelledBy="quarter-end-confirm-title"
        >
            <h3 id="quarter-end-confirm-title">{quarterLabel}を終了しますか？</h3>
            <p className="end-game-confirm-message">
                終了すると次のクォーターのスタメン選択に進みます。
            </p>
            <div className="modal-actions-column">
                <button
                    className="btn btn-primary btn-large"
                    onClick={() => { setShowQuarterEndConfirm(false); executeQuarterEnd(); }}
                >
                    終了する
                </button>
                <button className="btn btn-secondary btn-large" onClick={() => setShowQuarterEndConfirm(false)}>
                    キャンセル
                </button>
            </div>
        </Modal>
    );

    // スタメン選択へ戻る導線（両モード共通・quarterEnd中のみ）。
    // スタメン画面から戻ったあと、次Qのスタメンを選び直せなくなるのを防ぐ
    const openLineupButton = phase === 'quarterEnd' && onOpenLineup && (
        <button className="btn btn-secondary btn-small" onClick={onOpenLineup}>
            スタメン選択へ
        </button>
    );

    // 取り消しボタン（両モード共通・quarterEnd中のみ）
    const undoQuarterEndButton = canUndoQuarterEnd && (
        <button className="btn btn-secondary btn-small" onClick={handleUndoQuarterEnd}>
            終了を取り消す
        </button>
    );

    const scoreA = getTeamScore('teamA');
    const scoreB = getTeamScore('teamB');

    // シンプルモード用のコンパクトレイアウト
    if (mode === 'simple') {
        return (
            <div className="scoreboard-new scoreboard-simple">
                {/* クォーター表示（上部に1セット） */}
                <div className="simple-quarter-row">
                    <span className={`quarter-badge ${currentQuarter <= 4 ? `q${currentQuarter}` : 'ot'}`}>{quarterLabel}</span>
                    {phase === 'playing' && (
                        <button className="btn btn-quarter-end btn-small" onClick={handleQuarterManagement}>
                            <span aria-hidden="true">🏁</span>
                            <span>{quarterLabel}終了</span>
                        </button>
                    )}
                    {phase === 'quarterEnd' && (
                        <button className="btn btn-primary btn-small" onClick={handleQuarterManagement}>
                            <span aria-hidden="true">▶</span>
                            <span>{currentQuarter <= 4 ? `Q${currentQuarter}へ` : `${quarterLabel}へ`}</span>
                        </button>
                    )}
                    {openLineupButton}
                    {undoQuarterEndButton}
                    {phase === 'setup' && (
                        <button className="btn btn-primary btn-small" onClick={() => dispatch({ type: 'START_GAME' })}>
                            開始
                        </button>
                    )}
                </div>

                {/* チーム得点カード */}
                <div className="scoreboard-simple-grid">
                    {/* チームA */}
                    <div className={`simple-team-card color-${state.teamA.color}`}>
                        <div className="simple-team-header">
                            <span className="simple-team-name">{state.teamA.name}</span>
                            <span className="simple-team-score">{scoreA}</span>
                        </div>
                        <div className="simple-team-footer">
                            <span className={`tf-badge ${(state.teamA.teamFouls[currentQuarter - 1] || 0) >= 4 ? 'bonus' : ''}`}>
                                TF {(state.teamA.teamFouls[currentQuarter - 1] || 0)}
                            </span>
                            {phase === 'playing' && onTimeout && (
                                <button
                                    className="btn-timeout-simple"
                                    onClick={() => handleTimeoutClick('teamA')}
                                    disabled={state.teamA.timeouts.some(t => t.quarter === currentQuarter)}
                                >
                                    タイムアウト
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
                            <span className={`tf-badge ${(state.teamB.teamFouls[currentQuarter - 1] || 0) >= 4 ? 'bonus' : ''}`}>
                                TF {(state.teamB.teamFouls[currentQuarter - 1] || 0)}
                            </span>
                            {phase === 'playing' && onTimeout && (
                                <button
                                    className="btn-timeout-simple"
                                    onClick={() => handleTimeoutClick('teamB')}
                                    disabled={state.teamB.timeouts.some(t => t.quarter === currentQuarter)}
                                >
                                    タイムアウト
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* タイムアウト入力モーダル */}
                <TimeoutInputModal
                    isOpen={timeoutModalOpen}
                    teamName={timeoutTeamId === 'teamA' ? state.teamA.name : state.teamB.name}
                    teamColor={timeoutTeamId === 'teamA' ? state.teamA.color : state.teamB.color}
                    currentQuarter={currentQuarter}
                    onConfirm={handleTimeoutConfirm}
                    onCancel={handleTimeoutCancel}
                />
                {quarterEndConfirmModal}
            </div>
        );
    }

    // チームスコアブロック（チーム名 + スコア。TF/タイムアウトはTeamPanel側に表示）
    const renderTeamBlock = (teamId: 'teamA' | 'teamB') => {
        const team = teamId === 'teamA' ? state.teamA : state.teamB;
        const score = teamId === 'teamA' ? scoreA : scoreB;
        return (
            <div className={`team-score-block ${teamId === 'teamA' ? 'team-a-block' : 'team-b-block'} color-${team.color}`}>
                <div className="team-info">
                    <span className="team-label">{team.name}</span>
                </div>
                <div className="score-display">{score}</div>
            </div>
        );
    };

    return (
        <div className="scoreboard-new">
            {/* スコア表示（チーム名・スコア・クォーターの1段構成） */}
            <div className="scoreboard-main">
                {renderTeamBlock('teamA')}

                {/* クォーター表示 */}
                <div className="quarter-section">
                    <span className={`quarter-badge-large ${currentQuarter <= 4 ? `q${currentQuarter}` : 'ot'}`}>{quarterLabel}</span>
                    <div className="quarter-controls">
                        {phase === 'playing' && (
                            <button className="btn btn-quarter-end btn-small" onClick={handleQuarterManagement}>
                                <span aria-hidden="true">🏁</span>
                                <span>{quarterLabel}終了</span>
                            </button>
                        )}
                        {phase === 'quarterEnd' && (
                            <button className="btn btn-primary btn-small" onClick={handleQuarterManagement}>
                                <span aria-hidden="true">▶</span>
                                <span>{currentQuarter <= 4 ? `Q${currentQuarter}へ` : `${quarterLabel}へ`}</span>
                            </button>
                        )}
                        {openLineupButton}
                        {undoQuarterEndButton}
                        {phase === 'setup' && (
                            <button className="btn btn-primary btn-small" onClick={() => dispatch({ type: 'START_GAME' })}>
                                試合開始
                            </button>
                        )}
                    </div>
                </div>

                {renderTeamBlock('teamB')}
            </div>

            {/* タイムアウト入力モーダル */}
            <TimeoutInputModal
                isOpen={timeoutModalOpen}
                teamName={timeoutTeamId === 'teamA' ? state.teamA.name : state.teamB.name}
                teamColor={timeoutTeamId === 'teamA' ? state.teamA.color : state.teamB.color}
                currentQuarter={currentQuarter}
                onConfirm={handleTimeoutConfirm}
                onCancel={handleTimeoutCancel}
            />
            {quarterEndConfirmModal}
        </div>
    );
}
