import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { SavedTeam, NumberType } from '../../utils/teamStorage';
import { loadMyTeams } from '../../utils/teamStorage';
import { getGameNameSuggestions } from '../../utils/gameHistoryStorage';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { todayInputDate } from '../../utils/localDate';
import { MAX_PLAYERS_PER_TEAM } from '../../types/game';
import { MyTeamManager } from '../MyTeamManager';
import { OpponentSelect } from '../OpponentSelect';
import './GameSetup.css';

// 履歴（時計を巻き戻す）アイコン
function HistoryIcon() {
    return (
        <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M3 3v5h5" />
            <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
            <path d="M12 7v5l3 2" />
        </svg>
    );
}

interface GameSetupProps {
    onComplete: (setupData: {
        gameName: string;
        date: string;
        myTeam: SavedTeam;
        opponentTeam: SavedTeam;
        myTeamColor: 'white' | 'blue';
        opponentTeamColor: 'white' | 'blue';
        numberType: NumberType;  // マイチームの使用番号タイプ
        showThreePoint: boolean;  // 3P入力ボタンを表示するか
        quarterMinutes: 5 | 6;    // クォーター時間（分）
    }) => void;
    onBack: () => void;
}

type SetupStep = 'basic' | 'myTeam' | 'players' | 'opponent' | 'confirm';

export function GameSetup({ onComplete, onBack }: GameSetupProps) {
    const [step, setStep] = useState<SetupStep>('basic');

    // Setup Data
    const [gameName, setGameName] = useState('');
    const [date, setDate] = useState(todayInputDate); // YYYY-MM-DD（現地日付。理由は localDate.ts）
    const [myTeam, setMyTeam] = useState<SavedTeam | null>(null);
    const [opponentTeam, setOpponentTeam] = useState<SavedTeam | null>(null);

    // Team Colors
    const [myTeamColor, setMyTeamColor] = useState<'white' | 'blue'>('white');
    const [opponentTeamColor, setOpponentTeamColor] = useState<'white' | 'blue'>('blue');

    // マイチームの使用番号タイプ
    const [numberType, setNumberType] = useState<NumberType>('bib');

    // 3P入力ボタンを表示するか（ミニバスは通常OFF）
    const [showThreePoint, setShowThreePoint] = useState(false);

    // クォーター時間（分）。JBA公式は6分、地方大会などで5分運用あり
    const [quarterMinutes, setQuarterMinutes] = useState<5 | 6>(6);

    // 出場選手確認用（除外する選手のインデックス）
    const [excludedPlayerIndices, setExcludedPlayerIndices] = useState<Set<number>>(new Set());

    // マイチーム簡易選択用
    const [myTeams] = useState<SavedTeam[]>(loadMyTeams);
    const [showMyTeamManager, setShowMyTeamManager] = useState(false);

    // 試合名の候補（同日・最近の試合名）
    const gameNameSuggestions = useMemo(() => getGameNameSuggestions(date), [date]);

    // カスタムサジェスションドロップダウン用
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionIndex, setSuggestionIndex] = useState(-1);
    const suggestionRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // 入力値でフィルタされた候補
    const filteredSuggestions = useMemo(() => {
        if (!gameName.trim()) return gameNameSuggestions;
        const lower = gameName.toLowerCase();
        return gameNameSuggestions.filter(s => s.toLowerCase().includes(lower));
    }, [gameName, gameNameSuggestions]);

    // ドロップダウン外クリックで閉じる
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                suggestionRef.current && !suggestionRef.current.contains(e.target as Node) &&
                inputRef.current && !inputRef.current.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside as EventListener);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside as EventListener);
        };
    }, []);

    const handleSuggestionSelect = useCallback((value: string) => {
        setGameName(value);
        setShowSuggestions(false);
        setSuggestionIndex(-1);
        inputRef.current?.focus();
    }, []);

    const handleGameNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions || filteredSuggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSuggestionIndex(prev => (prev + 1) % filteredSuggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSuggestionIndex(prev => (prev <= 0 ? filteredSuggestions.length - 1 : prev - 1));
        } else if (e.key === 'Enter' && suggestionIndex >= 0) {
            e.preventDefault();
            handleSuggestionSelect(filteredSuggestions[suggestionIndex]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    }, [showSuggestions, filteredSuggestions, suggestionIndex, handleSuggestionSelect]);

    const handleBasicSubmit = () => {
        if (date) {
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

    // 試合名が未入力なら「日付 vs 対戦相手」を自動生成
    const effectiveGameName = gameName.trim() ||
        (opponentTeam ? `${date} vs ${opponentTeam.name}` : date);
    const isGameNameAuto = !gameName.trim();

    // 上限を掛ける前に登録された（あるいは取り込んだ）チームは16人以上のことがある。
    // スコアシートは15人分しか描かないので、記録を始める前に知らせる。
    // ここで弾かないのは、当日の名簿を削らせるより「出る形が違う」と分かって
    // 進めるほうが実害が小さいため。
    const overSizedTeams = [
        { label: 'マイチーム', team: myTeam },
        { label: '対戦チーム', team: opponentTeam },
    ].filter(({ team }) => (team?.players.length ?? 0) > MAX_PLAYERS_PER_TEAM);

    const handleConfirm = () => {
        if (myTeam && opponentTeam) {
            // 除外選手を除いたマイチームの選手
            const filteredPlayers = myTeam.players.filter((_, i) => !excludedPlayerIndices.has(i));

            // numberTypeに応じてソート
            const sortedPlayers = [...filteredPlayers].sort((a, b) => {
                if (numberType === 'uniform') {
                    // ユニフォーム番号でソート
                    const aNum = a.uniformNumber ?? a.number;
                    const bNum = b.uniformNumber ?? b.number;
                    return aNum - bNum;
                } else {
                    // ビブス番号でソート（デフォルト）
                    const aNum = a.bibNumber ?? a.number;
                    const bNum = b.bibNumber ?? b.number;
                    return aNum - bNum;
                }
            });

            const filteredMyTeam: SavedTeam = {
                ...myTeam,
                players: sortedPlayers,
            };
            onComplete({
                gameName: effectiveGameName,
                date,
                myTeam: filteredMyTeam,
                opponentTeam,
                myTeamColor,
                opponentTeamColor,
                numberType,
                showThreePoint,
                quarterMinutes,
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
        <main className="game-setup">
            <div className="setup-header">
                <button
                    className="btn btn-secondary"
                    onClick={step === 'basic' ? onBack : () => setStep(prev => getPrevStep(prev))}
                >
                    ← 戻る
                </button>
                <h1>試合設定</h1>
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
                            <label htmlFor="game-setup-game-name">
                                試合名 / 大会名
                                <span className="label-optional">任意</span>
                            </label>
                            <div className="suggestion-input-wrapper">
                                <input
                                    id="game-setup-game-name"
                                    ref={inputRef}
                                    type="text"
                                    className="input"
                                    value={gameName}
                                    onChange={e => {
                                        setGameName(e.target.value);
                                        setShowSuggestions(true);
                                        setSuggestionIndex(-1);
                                    }}
                                    onFocus={() => {
                                        if (filteredSuggestions.length > 0) {
                                            setShowSuggestions(true);
                                        }
                                    }}
                                    onKeyDown={handleGameNameKeyDown}
                                    placeholder="例: 冬季大会 第1回戦"
                                    autoFocus
                                    autoComplete="off"
                                    name="game-name-no-autofill"
                                />
                                {showSuggestions && filteredSuggestions.length > 0 && (
                                    <div className="suggestion-dropdown" ref={suggestionRef} role="listbox">
                                        <div className="suggestion-dropdown-header">
                                            <HistoryIcon />
                                            <span>最近の試合名</span>
                                        </div>
                                        {filteredSuggestions.map((name, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                role="option"
                                                aria-selected={idx === suggestionIndex}
                                                className={`suggestion-item ${idx === suggestionIndex ? 'active' : ''}`}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    handleSuggestionSelect(name);
                                                }}
                                            >
                                                <span className="suggestion-item-icon" aria-hidden="true">
                                                    <HistoryIcon />
                                                </span>
                                                <span className="suggestion-item-text">{name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <p className="field-hint">
                                空欄のままでもOK。「日付 vs 対戦相手」で自動的に名前が付きます。
                            </p>
                        </div>
                        <div className="form-group">
                            <label htmlFor="game-setup-field-1">日付</label>
                            <input id="game-setup-field-1"
                                type="date"
                                className="input"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                            />
                        </div>
                        <button
                            className="btn btn-primary btn-large next-btn"
                            onClick={handleBasicSubmit}
                            disabled={!date}
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
                                    <button
                                        type="button"
                                        key={team.id}
                                        className={`select-card ${myTeam?.id === team.id ? 'selected' : ''}`}
                                        onClick={() => handleMyTeamSelect(team)}
                                    >
                                        <span className="team-name">{team.name}</span>
                                        <span className="team-detail">{team.players.length}名</span>
                                    </button>
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
                                        <span className="player-number">#{formatPlayerNumber(player.bibNumber ?? player.uniformNumber ?? player.number)}</span>
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
                    // 戻る導線はウィザードヘッダーの「← 戻る」（出場選手へ）に一本化
                    <OpponentSelect onSelect={handleOpponentSelect} />
                )}

                {step === 'confirm' && myTeam && opponentTeam && (
                    <div className="setup-step confirm">
                        <h3>設定確認</h3>

                        <div className="confirm-card">
                            <div className="confirm-row">
                                <span className="confirm-row-label">試合名</span>
                                <span>
                                    {effectiveGameName}
                                    {isGameNameAuto && <span className="confirm-auto-badge">自動</span>}
                                </span>
                            </div>
                            <div className="confirm-row">
                                <span className="confirm-row-label">日付</span>
                                <span>{date}</span>
                            </div>

                            <div className="confirm-number-type">
                                {/* 見出しがただのspanだと読み上げで「ビブス番号 ラジオボタン」としか
                                    聞こえず、何を選ぶグループなのか分からない。
                                    radiogroup にして見出しを名前として結び付ける */}
                                <span className="number-type-label" id="number-type-label">マイチームの使用番号</span>
                                <div className="number-type-options" role="radiogroup" aria-labelledby="number-type-label">
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

                            <div className="confirm-number-type">
                                <span className="number-type-label" id="three-point-label">3Pシュート</span>
                                <div className="number-type-options" role="radiogroup" aria-labelledby="three-point-label">
                                    <label className={`number-type-option three-point-option ${!showThreePoint ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="showThreePoint"
                                            checked={!showThreePoint}
                                            onChange={() => setShowThreePoint(false)}
                                        />
                                        <span>🚫 使わない</span>
                                    </label>
                                    <label className={`number-type-option three-point-option ${showThreePoint ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="showThreePoint"
                                            checked={showThreePoint}
                                            onChange={() => setShowThreePoint(true)}
                                        />
                                        <span>🎯 使う</span>
                                    </label>
                                </div>
                            </div>

                            <div className="confirm-number-type">
                                <span className="number-type-label" id="quarter-minutes-label">クォーター時間</span>
                                <div className="number-type-options" role="radiogroup" aria-labelledby="quarter-minutes-label">
                                    <label className={`number-type-option ${quarterMinutes === 6 ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="quarterMinutes"
                                            checked={quarterMinutes === 6}
                                            onChange={() => setQuarterMinutes(6)}
                                        />
                                        <span>6分（公式）</span>
                                    </label>
                                    <label className={`number-type-option ${quarterMinutes === 5 ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="quarterMinutes"
                                            checked={quarterMinutes === 5}
                                            onChange={() => setQuarterMinutes(5)}
                                        />
                                        <span>5分</span>
                                    </label>
                                </div>
                            </div>

                            <div className="confirm-colors">
                                <button className="btn btn-secondary" onClick={handleColorSwap}>
                                    ⇄ チームカラー入れ替え
                                </button>
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

                        {overSizedTeams.length > 0 && (
                            <p className="setup-warning" role="status">
                                ⚠ {overSizedTeams.map(({ label, team }) => `${label}（${team!.players.length}名）`).join('・')}
                                {' '}は{MAX_PLAYERS_PER_TEAM}人を超えています。
                                スコアシートには背番号順で先頭{MAX_PLAYERS_PER_TEAM}人までしか印字されません。
                            </p>
                        )}

                        <button
                            className="btn btn-success btn-large start-game-btn"
                            onClick={handleConfirm}
                        >
                            スタメン選択へ
                        </button>
                    </div>
                )}
            </div>
        </main>
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
