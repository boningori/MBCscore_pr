import { useState, useCallback, useMemo, useRef } from 'react';
import type { FoulType, FreeThrowResult, ShotSituation, Player } from '../../types/game';
import { MAX_PERSONAL_FOULS, suggestFreeThrowCount } from '../../types/game';
import './FoulInputFlow.css';

type Step = 'foulType' | 'shotSituation' | 'ftCount' | 'shooter' | 'ftResult';

const LONG_PRESS_DURATION = 500; // 長押し判定時間（ミリ秒）

interface FoulInputFlowProps {
    onComplete: (data: {
        foulType: FoulType;
        shotSituation: ShotSituation;
        freeThrows: number;
        freeThrowResults: FreeThrowResult[];
        shooterPlayerId: string | null;
    }) => void;
    onCancel: () => void;
    hasSelectedPlayer: boolean;
    currentFoulCount?: number;
    playerName?: string;
    teamFouls: number;
    opponentTeamId: string;
    opponentPlayers: Player[];
    opponentTeamName: string;
}

const FOUL_TYPES: { type: FoulType; label: string; description: string; requiresPlayer: boolean }[] = [
    { type: 'P', label: 'P', description: 'パーソナルファウル', requiresPlayer: true },
    { type: 'T', label: 'T', description: 'テクニカルファウル', requiresPlayer: true },
    { type: 'U', label: 'U', description: 'アンスポーツマンライク', requiresPlayer: true },
    { type: 'D', label: 'D', description: 'ディスクォリファイイング', requiresPlayer: true },
];

const SHOT_SITUATIONS: { value: ShotSituation; label: string }[] = [
    { value: '2P', label: '2Pシュート中' },
    { value: '3P', label: '3Pシュート中' },
];

export function FoulInputFlow({
    onComplete,
    onCancel,
    hasSelectedPlayer,
    currentFoulCount = 0,
    playerName,
    teamFouls,
    opponentPlayers,
    opponentTeamName,
}: FoulInputFlowProps) {
    const [step, setStep] = useState<Step>('foulType');
    const [foulType, setFoulType] = useState<FoulType | null>(null);
    const [shotSituation, setShotSituation] = useState<ShotSituation>('none');
    const [freeThrows, setFreeThrows] = useState<number>(0);
    const [freeThrowResults, setFreeThrowResults] = useState<FreeThrowResult[]>([]);
    const [shooterPlayerId, setShooterPlayerId] = useState<string | null>(null);

    // 長押し検出用
    const longPressTimer = useRef<number | null>(null);
    const isLongPress = useRef(false);

    const isFouledOut = currentFoulCount >= MAX_PERSONAL_FOULS;

    // ペナルティ状態（チームファウル5個目以降）
    const isPenalty = teamFouls >= 4;

    // ステップタイトル
    const stepTitles: Record<Step, string> = {
        foulType: 'ファウル種類を選択',
        shotSituation: 'シュート状況を選択（シュートファウル）',
        ftCount: 'フリースロー本数を選択',
        ftResult: 'フリースロー結果を入力',
        shooter: 'シューターを選択',
    };

    // FT本数の推奨値を計算
    const suggestedFtCount = useMemo(() => {
        if (!foulType) return 0;
        return suggestFreeThrowCount(foulType, teamFouls, shotSituation);
    }, [foulType, teamFouls, shotSituation]);

    // Pファウル通常タップ（シュート中でないファウル）
    const handlePFoulNormalTap = useCallback(() => {
        setFoulType('P');
        setShotSituation('none');

        // ペナルティ状態（チームファウル5個目以降）ならFT入力へ
        if (isPenalty) {
            const suggested = 2; // ペナルティは2本
            setFreeThrows(suggested);
            setFreeThrowResults(new Array(suggested).fill(null));
            setStep('shooter');
        } else {
            // ペナルティでなければ即記録完了
            onComplete({
                foulType: 'P',
                shotSituation: 'none',
                freeThrows: 0,
                freeThrowResults: [],
                shooterPlayerId: null,
            });
        }
    }, [isPenalty, onComplete]);

    // Pファウル長押し（シュートファウル）
    const handlePFoulLongPress = useCallback(() => {
        setFoulType('P');
        setStep('shotSituation');
    }, []);

    // 長押し開始
    const handlePressStart = useCallback(() => {
        isLongPress.current = false;
        longPressTimer.current = window.setTimeout(() => {
            isLongPress.current = true;
            handlePFoulLongPress();
        }, LONG_PRESS_DURATION);
    }, [handlePFoulLongPress]);

    // 長押し終了
    const handlePressEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        // 長押しでなければ通常タップとして処理
        if (!isLongPress.current) {
            handlePFoulNormalTap();
        }
    }, [handlePFoulNormalTap]);

    // T/U/Dファウル選択
    const handleSpecialFoulSelect = useCallback((type: FoulType) => {
        setFoulType(type);
        setShotSituation('none');
        // 推奨FT本数を設定
        const suggested = suggestFreeThrowCount(type, teamFouls, 'none');
        setFreeThrows(suggested);
        setFreeThrowResults(new Array(suggested).fill(null));
        setStep('ftCount');
    }, [teamFouls]);

    // シュート状況選択（Pファウル長押し時のみ、2Pか3Pのみ）
    const handleShotSituationSelect = useCallback((situation: ShotSituation) => {
        setShotSituation(situation);
        // シュート中のファウル → シューター選択へ
        const suggested = suggestFreeThrowCount('P', teamFouls, situation);
        setFreeThrows(suggested);
        setFreeThrowResults(new Array(suggested).fill(null));
        setStep('shooter');
    }, [teamFouls]);

    // FT本数選択
    const handleFtCountSelect = useCallback((count: number) => {
        setFreeThrows(count);
        if (count === 0) {
            // FT 0本の場合はファウルのみ記録
            onComplete({
                foulType: foulType!,
                shotSituation,
                freeThrows: 0,
                freeThrowResults: [],
                shooterPlayerId: null,
            });
        } else {
            setFreeThrowResults(new Array(count).fill(null));
            setStep('shooter');  // シューター選択へ
        }
    }, [foulType, shotSituation, onComplete]);

    // FT結果入力
    const handleFtResult = useCallback((index: number, result: FreeThrowResult) => {
        const newResults = [...freeThrowResults];
        newResults[index] = result;
        setFreeThrowResults(newResults);
    }, [freeThrowResults]);

    // FT結果入力完了 → 記録完了
    const handleFtResultComplete = useCallback(() => {
        // すべてのFT結果が入力されているか確認
        if (freeThrowResults.some(r => r === null)) {
            return;
        }
        if (!foulType || !shooterPlayerId) return;
        onComplete({
            foulType,
            shotSituation,
            freeThrows,
            freeThrowResults: freeThrowResults as FreeThrowResult[],
            shooterPlayerId,
        });
    }, [freeThrowResults, foulType, shotSituation, freeThrows, shooterPlayerId, onComplete]);

    // シューター選択
    const handleShooterSelect = useCallback((playerId: string) => {
        setShooterPlayerId(playerId);
    }, []);

    // シューター選択完了 → FT結果入力へ
    const handleShooterComplete = useCallback(() => {
        if (!shooterPlayerId) return;
        setStep('ftResult');
    }, [shooterPlayerId]);

    // 戻るボタン
    const handleBack = useCallback(() => {
        switch (step) {
            case 'shotSituation':
                setStep('foulType');
                setFoulType(null);
                break;
            case 'ftCount':
                if (['T', 'U', 'D'].includes(foulType!)) {
                    setStep('foulType');
                    setFoulType(null);
                } else {
                    // Pファウルのシュートファウル時
                    setStep('shotSituation');
                }
                break;
            case 'shooter':
                // シュートファウル（2P/3P）からの場合はshotSituationへ
                // ペナルティからの場合はfoulTypeへ
                // T/U/DからはftCountへ
                if (['T', 'U', 'D'].includes(foulType!)) {
                    setStep('ftCount');
                } else if (shotSituation !== 'none') {
                    setStep('shotSituation');
                } else {
                    setStep('foulType');
                    setFoulType(null);
                }
                setShooterPlayerId(null);
                break;
            case 'ftResult':
                setStep('shooter');
                setFreeThrowResults(new Array(freeThrows).fill(null));
                break;
        }
    }, [step, foulType, freeThrows, shotSituation]);

    // FT成功数を計算
    const ftMadeCount = freeThrowResults.filter(r => r === 'made').length;
    const ftAllEntered = freeThrowResults.every(r => r !== null);

    // コート上の選手のみフィルタリング
    const availableShooters = opponentPlayers.filter(p => p.isOnCourt);

    return (
        <div className="foul-input-flow-overlay" onClick={onCancel}>
            <div className="foul-input-flow" onClick={e => e.stopPropagation()}>
                {/* ヘッダー */}
                <div className="foul-input-header">
                    <h3>{stepTitles[step]}</h3>
                    {step !== 'foulType' && (
                        <button className="btn-back" onClick={handleBack}>
                            ← 戻る
                        </button>
                    )}
                </div>

                {/* ファウルアウト警告 */}
                {hasSelectedPlayer && isFouledOut && (
                    <div className="foul-warning">
                        ⚠️ {playerName || '選手'}は既に{currentFoulCount}個のファウル（ファウルアウト済み）
                    </div>
                )}

                {/* 現在のファウル数表示 */}
                {hasSelectedPlayer && !isFouledOut && currentFoulCount > 0 && step === 'foulType' && (
                    <div className="foul-count-info">
                        {playerName || '選手'}: 現在{currentFoulCount}個のファウル
                        {currentFoulCount >= 4 && <span className="foul-trouble"> (ファウルトラブル)</span>}
                    </div>
                )}

                {/* チームファウル表示 */}
                {step === 'foulType' && (
                    <div className="team-foul-info">
                        チームファウル: {teamFouls}個
                        {teamFouls >= 4 && <span className="penalty-warning"> (次からペナルティ)</span>}
                    </div>
                )}

                {/* Step 1: ファウルタイプ選択 */}
                {step === 'foulType' && (
                    <div className="foul-type-list">
                        {/* Pファウル - タップ/長押しで分岐 */}
                        <button
                            className={`foul-type-btn ${!hasSelectedPlayer ? 'disabled' : ''} ${isFouledOut ? 'warning-context' : ''}`}
                            onMouseDown={hasSelectedPlayer ? handlePressStart : undefined}
                            onMouseUp={hasSelectedPlayer ? handlePressEnd : undefined}
                            onMouseLeave={() => {
                                if (longPressTimer.current) {
                                    clearTimeout(longPressTimer.current);
                                    longPressTimer.current = null;
                                }
                            }}
                            onTouchStart={hasSelectedPlayer ? handlePressStart : undefined}
                            onTouchEnd={hasSelectedPlayer ? handlePressEnd : undefined}
                            disabled={!hasSelectedPlayer}
                        >
                            <span className="foul-type-label">P</span>
                            <div className="foul-type-desc-container">
                                <span className="foul-type-desc">パーソナルファウル</span>
                                <span className="foul-type-hint">長押しでシュートファウル</span>
                            </div>
                        </button>

                        {/* T/U/Dファウル - 通常タップ */}
                        {FOUL_TYPES.filter(f => f.type !== 'P').map(foul => {
                            const isDisabled = foul.requiresPlayer && !hasSelectedPlayer;
                            return (
                                <button
                                    key={foul.type}
                                    className={`foul-type-btn ${isDisabled ? 'disabled' : ''} ${isFouledOut ? 'warning-context' : ''}`}
                                    onClick={() => handleSpecialFoulSelect(foul.type)}
                                    disabled={isDisabled}
                                >
                                    <span className="foul-type-label">{foul.label}</span>
                                    <span className="foul-type-desc">{foul.description}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Step 2: シュート状況選択 */}
                {step === 'shotSituation' && (
                    <div className="shot-situation-list">
                        {SHOT_SITUATIONS.map(situation => (
                            <button
                                key={situation.value}
                                className="shot-situation-btn"
                                onClick={() => handleShotSituationSelect(situation.value)}
                            >
                                {situation.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Step 3: FT本数選択 */}
                {step === 'ftCount' && (
                    <div className="ft-count-section">
                        <div className="ft-suggested">
                            推奨: {suggestedFtCount}本
                        </div>
                        <div className="ft-count-list">
                            {/* T/U/Dファウルは常にFTがあるので0本は選択不可 */}
                            {[0, 1, 2, 3]
                                .filter(count => !(['T', 'U', 'D'].includes(foulType!) && count === 0))
                                .map(count => (
                                    <button
                                        key={count}
                                        className={`ft-count-btn ${count === suggestedFtCount ? 'suggested' : ''}`}
                                        onClick={() => handleFtCountSelect(count)}
                                    >
                                        {count}本
                                    </button>
                                ))}
                        </div>
                    </div>
                )}

                {/* Step 4: シューター選択 */}
                {step === 'shooter' && (
                    <div className="shooter-section">
                        <div className="shooter-team-name">
                            {opponentTeamName}（コート上の選手）
                        </div>
                        <div className="shooter-list">
                            {availableShooters.map(player => (
                                <button
                                    key={player.id}
                                    className={`shooter-btn ${shooterPlayerId === player.id ? 'selected' : ''}`}
                                    onClick={() => handleShooterSelect(player.id)}
                                >
                                    <span className="shooter-number">#{player.number}</span>
                                    <span className="shooter-name">{player.courtName || player.name}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            className="btn btn-primary shooter-complete"
                            onClick={handleShooterComplete}
                            disabled={!shooterPlayerId}
                        >
                            次へ
                        </button>
                    </div>
                )}

                {/* Step 5: FT結果入力 */}
                {step === 'ftResult' && (
                    <div className="ft-result-section">
                        <div className="shooter-info">
                            シューター: #{availableShooters.find(p => p.id === shooterPlayerId)?.number} {availableShooters.find(p => p.id === shooterPlayerId)?.courtName || availableShooters.find(p => p.id === shooterPlayerId)?.name}
                        </div>
                        <div className="ft-result-list">
                            {Array.from({ length: freeThrows }).map((_, index) => (
                                <div key={index} className="ft-result-row">
                                    <span className="ft-result-label">{index + 1}本目:</span>
                                    <div className="ft-result-buttons">
                                        <button
                                            className={`ft-result-btn success ${freeThrowResults[index] === 'made' ? 'selected' : ''}`}
                                            onClick={() => handleFtResult(index, 'made')}
                                        >
                                            ○ 成功
                                        </button>
                                        <button
                                            className={`ft-result-btn fail ${freeThrowResults[index] === 'missed' ? 'selected' : ''}`}
                                            onClick={() => handleFtResult(index, 'missed')}
                                        >
                                            × 失敗
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="ft-result-summary">
                            結果: {ftMadeCount}/{freeThrows} 成功 (+{ftMadeCount}点)
                        </div>
                        <button
                            className="btn btn-primary ft-result-next"
                            onClick={handleFtResultComplete}
                            disabled={!ftAllEntered}
                        >
                            記録
                        </button>
                    </div>
                )}

                {/* キャンセルボタン */}
                <div className="foul-input-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
    );
}
