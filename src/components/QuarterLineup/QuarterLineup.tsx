import { useState } from 'react';
import type { Player } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import { LineupTeamPanel } from './LineupTeamPanel';
import './QuarterLineup.css';

interface QuarterLineupProps {
    quarter: number;
    teamName: string;
    players: Player[];
    onConfirm: (startingPlayerIds: string[]) => void;
    onBack?: () => void;
    /** 確定ボタンの文言（未指定時: Q1=試合開始 / Q2以降=Qx 開始）。
        1チーム目のスタメン選択では「次へ」系を渡し、実際の開始と区別する */
    confirmLabel?: string;
}

export function QuarterLineup({
    quarter,
    teamName,
    players,
    onConfirm,
    onBack,
    confirmLabel,
}: QuarterLineupProps) {
    const computeInitialSelected = () =>
        players
            .filter(p => p.isOnCourt && p.fouls.length < 5)
            .map(p => p.id);

    const [selectedIds, setSelectedIds] = useState<string[]>(computeInitialSelected);

    // チームまたはクォーターが変わったら選択をリセット
    // （レンダー中の状態調整。useEffectでのcascading render警告を避けるため）
    const [prevLineupKey, setPrevLineupKey] = useState({ teamName, quarter });
    if (teamName !== prevLineupKey.teamName || quarter !== prevLineupKey.quarter) {
        setPrevLineupKey({ teamName, quarter });
        setSelectedIds(computeInitialSelected());
    }

    const handlePlayerToggle = (playerId: string) => {
        if (selectedIds.includes(playerId)) {
            setSelectedIds(selectedIds.filter(id => id !== playerId));
        } else if (selectedIds.length < PLAYERS_ON_COURT) {
            setSelectedIds([...selectedIds, playerId]);
        }
    };

    const handleConfirm = () => {
        if (selectedIds.length === PLAYERS_ON_COURT) {
            onConfirm(selectedIds);
        }
    };

    const isValid = selectedIds.length === PLAYERS_ON_COURT;

    // クォーター色（1Q/3Qは赤、2Q/4Q/OTは黒）
    const isOT = quarter > 4;
    const quarterClass = isOT ? 'q-even' : (quarter === 1 || quarter === 3 ? 'q-odd' : 'q-even');
    const quarterLabel = isOT
        ? (quarter === 5 ? 'OT' : `OT${quarter - 4}`)
        : `Q${quarter}`;

    return (
        <div className="quarter-lineup">
            <div className="quarter-lineup-header">
                {onBack && (
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← 戻る
                    </button>
                )}
                <div className={`quarter-badge ${quarterClass}`}>
                    {quarterLabel}
                </div>
                <h2>{teamName} スタメン選択</h2>
            </div>

            <LineupTeamPanel
                quarter={quarter}
                players={players}
                selectedIds={selectedIds}
                onToggle={handlePlayerToggle}
            />

            <div className="quarter-lineup-actions">
                <button
                    className="btn btn-success btn-large"
                    onClick={handleConfirm}
                    disabled={!isValid}
                >
                    {confirmLabel ?? (quarter === 1 ? '試合開始' : `${quarterLabel} 開始`)}
                </button>
            </div>
        </div>
    );
}
