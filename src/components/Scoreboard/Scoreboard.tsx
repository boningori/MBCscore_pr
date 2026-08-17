import { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Modal } from '../Modal';
import { quarterLabel } from '../../utils/quarterLabel';
import './Scoreboard.css';

interface ScoreboardProps {
    onQuarterEnd?: () => void;
    /** quarterEnd中にスタメン選択画面へ戻る導線（未指定なら表示しない） */
    onOpenLineup?: () => void;
}

// TF・タイムアウトはフル/シンプルとも TeamPanel のヘッダーが担当する。
// 「そのチームの状態はそのチームのパネルを見る」に統一するため、
// スコアボードはチーム名・得点・クォーターだけを扱う。
// レイアウトもモードで分岐せず1本。狭い画面への対応は幅のメディアクエリが担当する
export function Scoreboard({ onQuarterEnd, onOpenLineup }: ScoreboardProps) {
    const { state, dispatch, getTeamScore } = useGame();

    const { currentQuarter, phase } = state;

    // 表記は共通のヘルパーに集約する（utils/quarterLabel）。
    // 画面ごとに組み立てると同じピリオドが別名で出る
    const periodLabel = quarterLabel(currentQuarter);

    // クォーター色（1Q/3Qは赤、2Q/4Q/OTは黒）。QuarterLineup.tsx と同じ規則。
    const quarterClass = currentQuarter > 4
        ? 'q-even'
        : (currentQuarter === 1 || currentQuarter === 3 ? 'q-odd' : 'q-even');

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

    // クォーター終了の取り消し（新Qとして記録済みのエントリがある場合は不可）。
    // 条件は handleUndoQuarterEnd と同じものを見ること。食い違うと、押しても
    // 何も起きないボタンが出る（保留アクションが実際にそうだった）
    const canUndoQuarterEnd = phase === 'quarterEnd' && currentQuarter > 1 &&
        !state.scoreHistory.some(e => e.quarter === currentQuarter) &&
        !state.statHistory.some(e => e.quarter === currentQuarter) &&
        !state.foulHistory.some(e => e.quarter === currentQuarter) &&
        !state.pendingActions.some(p => p.quarter === currentQuarter);

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
            <h3 id="quarter-end-confirm-title">{periodLabel}を終了しますか？</h3>
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
                <button className="btn btn-secondary btn-large" data-autofocus onClick={() => setShowQuarterEndConfirm(false)}>
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
                    <span className={`quarter-badge-large ${quarterClass}`}>{periodLabel}</span>
                    <div className="quarter-controls">
                        {phase === 'playing' && (
                            <button className="btn btn-quarter-end btn-small" onClick={handleQuarterManagement}>
                                <span aria-hidden="true">🏁</span>
                                <span>{periodLabel}終了</span>
                            </button>
                        )}
                        {phase === 'quarterEnd' && (
                            <button className="btn btn-primary btn-small" onClick={handleQuarterManagement}>
                                <span aria-hidden="true">▶</span>
                                <span>{`${periodLabel}へ`}</span>
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

            {quarterEndConfirmModal}
        </div>
    );
}
