import { useState } from 'react';
import type { SavedTeam, NumberType } from '../../utils/teamStorage';
import { loadMyTeams } from '../../utils/teamStorage';
import { MyTeamManager } from '../MyTeamManager';
import { OpponentSelect } from '../OpponentSelect';
import './GameSetup.css';

interface GameSetupProps {
    onComplete: (setupData: {
        gameName: string;
        date: string;
        myTeam: SavedTeam;
        opponentTeam: SavedTeam;
        myTeamColor: 'white' | 'blue';
        opponentTeamColor: 'white' | 'blue';
        numberType: NumberType;  // マイチームの使用番号タイプ
    }) => void;
    onBack: () => void;
}

type SetupStep = 'basic' | 'myTeam' | 'players' | 'opponent' | 'confirm';

export function GameSetup({ onComplete, onBack }: GameSetupProps) {
    const [step, setStep] = useState<SetupStep>('basic');

    // Setup Data
    const [gameName, setGameName] = useState('');
    const [date, setDate] = useState(new Date().toISOString().substring(0, 10)); // YYYY-MM-DD
    const [myTeam, setMyTeam] = useState<SavedTeam | null>(null);
    const [opponentTeam, setOpponentTeam] = useState<SavedTeam | null>(null);

    // Team Colors
    const [myTeamColor, setMyTeamColor] = useState<'white' | 'blue'>('white');
    const [opponentTeamColor, setOpponentTeamColor] = useState<'white' | 'blue'>('blue');

    // マイチームの使用番号タイプ
    const [numberType, setNumberType] = useState<NumberType>('bib');

    // 出場選手確認用（除外する選手のインデックス）
    const [excludedPlayerIndices, setExcludedPlayerIndices] = useState<Set<number>>(new Set());

    // マイチーム簡易選択用
    const [myTeams] = useState<SavedTeam[]>(loadMyTeams);
    const [showMyTeamManager, setShowMyTeamManager] = useState(false);

    const handleBasicSubmit = () => {
        if (gameName && date) {
            setStep('myTeam');
        }
    };

    const handleMyTeamSelect = (team: SavedTeam) => {
        setMyTeam(team);
        setExcludedPlayerIndices(new Set());
        setStep('players');
        setShowMyTeamManager(false);
    };

    const togglePlayerExclusion = (index: number) => {
        setExcludedPlayerIndices(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const activePlayerCount = myTeam ? myTeam.players.length - excludedPlayerIndices.size : 0;

    const handleOpponentSelect = (team: SavedTeam) => {
        setOpponentTeam(team);
        setStep('confirm');
    };

    const handleColorSwap = () => {
        setMyTeamColor(prev => prev === 'white' ? 'blue' : 'white');
        setOpponentTeamColor(prev => prev === 'white' ? 'blue' : 'white');
    };

    const handleConfirm = () => {
        if (myTeam && opponentTeam) {
            // 除外選手を除いたマイチームのコピーを作成
            const filteredMyTeam: SavedTeam = {
                ...myTeam,
                players: myTeam.players.filter((_, i) => !excludedPlayerIndices.has(i)),
            };
            onComplete({
                gameName,
                date,
                myTeam: filteredMyTeam,
                opponentTeam,
                myTeamColor,
                opponentTeamColor,
                numberType,
            });
        }
    };

    // MyTeamManager呼び出し（選択モード）
    if (showMyTeamManager) {
        return (
            <MyTeamManager
                onBack={() => setShowMyTeamManager(false)}
                onSelectTeam={handleMyTeamSelect}
                isSelectionMode={true}
            />
        );
    }



    return (
        <div className="game-setup">
            <div className="setup-header">
                <button
                    className="btn btn-secondary"
                    onClick={step === 'basic' ? onBack : () => setStep(prev => getPrevStep(prev))}
                >
                    ← 戻る
                </button>
                <h2>試合設定</h2>
            </div>

            <div className="setup-progress">
                {/* Step 1 */}
                <div className={`step-item ${step === 'basic' ? 'active' : ''} ${['myTeam', 'players', 'opponent', 'confirm'].includes(step) ? 'completed' : ''}`}>
                    <div className="step-circle">
                        {['myTeam', 'players', 'opponent', 'confirm'].includes(step) ? '✓' : '1'}
                    </div>
                    <span className="step-label">試合情報</span>
                </div>
                <div className={`step-connector ${['myTeam', 'players', 'opponent', 'confirm'].includes(step) ? 'completed' : ''}`}></div>

                {/* Step 2 */}
                <div className={`step-item ${step === 'myTeam' ? 'active' : ''} ${['players', 'opponent', 'confirm'].includes(step) ? 'completed' : ''}`}>
                    <div className="step-circle">
                        {['players', 'opponent', 'confirm'].includes(step) ? '✓' : '2'}
                    </div>
                    <span className="step-label">マイチーム</span>
                </div>
                <div className={`step-connector ${['players', 'opponent', 'confirm'].includes(step) ? 'completed' : ''}`}></div>

                {/* Step 3 */}
                <div className={`step-item ${step === 'players' ? 'active' : ''} ${['opponent', 'confirm'].includes(step) ? 'completed' : ''}`}>
                    <div className="step-circle">
                        {['opponent', 'confirm'].includes(step) ? '✓' : '3'}
                    </div>
                    <span className="step-label">出場選手</span>
                </div>
                <div className={`step-connector ${['opponent', 'confirm'].includes(step) ? 'completed' : ''}`}></div>

                {/* Step 4 */}
                <div className={`step-item ${step === 'opponent' ? 'active' : ''} ${step === 'confirm' ? 'completed' : ''}`}>
                    <div className="step-circle">
                        {step === 'confirm' ? '✓' : '4'}
                    </div>
                    <span className="step-label">対戦チーム</span>
                </div>
                <div className={`step-connector ${step === 'confirm' ? 'completed' : ''}`}></div>

                {/* Step 5 */}
                <div className={`step-item ${step === 'confirm' ? 'active' : ''}`}>
                    <div className="step-circle">5</div>
                    <span className="step-label">確認</span>
                </div>
            </div>

            <div className="setup-content">
                {step === 'basic' && (
                    <div className="setup-step basic-info">
                        <h3>基本情報</h3>
                        <div className="form-group">
                            <label>試合名 / 大会名</label>
                            <input
                                type="text"
                                className="input"
                                value={gameName}
                                onChange={e => setGameName(e.target.value)}
                                placeholder="例: 冬季大会 第1回戦"
                                autoFocus
                                autoComplete="off"
                            />
                        </div>
                        <div className="form-group">
                            <label>日付</label>
                            <input
                                type="date"
                                className="input"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                            />
                        </div>
                        <button
                            className="btn btn-primary btn-large next-btn"
                            onClick={handleBasicSubmit}
                            disabled={!gameName || !date}
                        >
                            次へ
                        </button>
                    </div>
                )}

                {step === 'myTeam' && (
                    <div className="setup-step my-team-select">
                        <h3>マイチーム選択</h3>

                        {myTeams.length === 0 ? (
                            <div className="no-teams">
                                <p>チームが登録されていません</p>
                                <button className="btn btn-primary" onClick={() => setShowMyTeamManager(true)}>
                                    チームを登録する
                                </button>
                            </div>
                        ) : (
                            <div className="team-select-list">
                                {myTeams.map(team => (
                                    <div
                                        key={team.id}
                                        className={`select-card ${myTeam?.id === team.id ? 'selected' : ''}`}
                                        onClick={() => handleMyTeamSelect(team)}
                                    >
                                        <span className="team-name">{team.name}</span>
                                        <span className="team-detail">{team.players.length}名</span>
                                    </div>
                                ))}
                                <button className="btn btn-secondary manage-btn" onClick={() => setShowMyTeamManager(true)}>
                                    チーム管理・新規登録
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {step === 'players' && myTeam && (
                    <div className="setup-step player-confirm">
                        <h3>出場選手確認</h3>
                        <p className="player-confirm-desc">
                            {myTeam.name} — 欠席の選手はチェックを外してください
                        </p>
                        <div className="player-count">
                            出場: <strong>{activePlayerCount}</strong> / {myTeam.players.length}名
                            {activePlayerCount < 5 && (
                                <span className="player-count-warning">（最低5名必要）</span>
                            )}
                        </div>
                        <div className="player-check-list">
                            {myTeam.players.map((player, index) => {
                                const excluded = excludedPlayerIndices.has(index);
                                return (
                                    <label
                                        key={index}
                                        className={`player-check-item ${excluded ? 'excluded' : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!excluded}
                                            onChange={() => togglePlayerExclusion(index)}
                                        />
                                        <span className="player-number">#{player.bibNumber ?? player.uniformNumber ?? player.number}</span>
                                        <span className="player-name-text">{player.name}</span>
                                        {player.isCaptain && <span className="captain-badge">C</span>}
                                    </label>
                                );
                            })}
                        </div>
                        <button
                            className="btn btn-primary btn-large next-btn"
                            onClick={() => setStep('opponent')}
                            disabled={activePlayerCount < 5}
                        >
                            次へ
                        </button>
                    </div>
                )}

                {step === 'opponent' && (
                    <OpponentSelect
                        onSelect={handleOpponentSelect}
                        onBack={() => setStep('myTeam')}
                    />
                )}

                {step === 'confirm' && myTeam && opponentTeam && (
                    <div className="setup-step confirm">
                        <h3>設定確認</h3>

                        <div className="confirm-card">
                            <div className="confirm-row">
                                <label>試合名</label>
                                <span>{gameName}</span>
                            </div>
                            <div className="confirm-row">
                                <label>日付</label>
                                <span>{date}</span>
                            </div>

                            <div className="confirm-colors">
                                <div className="color-section">
                                    <span className="color-label">チームカラー（音声入力用）</span>
                                    <button className="btn btn-secondary btn-small" onClick={handleColorSwap}>
                                        ⇄ 入れ替え
                                    </button>
                                </div>
                            </div>

                            <div className="confirm-number-type">
                                <span className="number-type-label">マイチームの使用番号</span>
                                <div className="number-type-options">
                                    <label className={`number-type-option ${numberType === 'bib' ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="numberType"
                                            value="bib"
                                            checked={numberType === 'bib'}
                                            onChange={() => setNumberType('bib')}
                                        />
                                        <span>ビブス番号</span>
                                    </label>
                                    <label className={`number-type-option ${numberType === 'uniform' ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="numberType"
                                            value="uniform"
                                            checked={numberType === 'uniform'}
                                            onChange={() => setNumberType('uniform')}
                                        />
                                        <span>ユニフォーム番号</span>
                                    </label>
                                </div>
                            </div>

                            <div className="confirm-vs">
                                <div className={`vs-team color-${myTeamColor}`}>
                                    <div className={`color-indicator ${myTeamColor}`}></div>
                                    <span className="vs-label">マイチーム ({myTeamColor === 'white' ? '白' : '青'})</span>
                                    <span className="vs-name">{myTeam.name}</span>
                                </div>
                                <span className="vs-mark">VS</span>
                                <div className={`vs-team color-${opponentTeamColor}`}>
                                    <div className={`color-indicator ${opponentTeamColor}`}></div>
                                    <span className="vs-label">対戦チーム ({opponentTeamColor === 'white' ? '白' : '青'})</span>
                                    <span className="vs-name">{opponentTeam.name}</span>
                                </div>
                            </div>
                        </div>

                        <button
                            className="btn btn-success btn-large start-game-btn"
                            onClick={handleConfirm}
                        >
                            試合開始
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function getPrevStep(current: SetupStep): SetupStep {
    switch (current) {
        case 'myTeam': return 'basic';
        case 'players': return 'myTeam';
        case 'opponent': return 'players';
        case 'confirm': return 'opponent';
        default: return 'basic';
    }
}
