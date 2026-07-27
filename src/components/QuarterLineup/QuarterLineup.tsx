import { useState } from 'react';
import type { Player, Team } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import { LineupTeamPanel } from './LineupTeamPanel';
import './QuarterLineup.css';

export type LineupTabId = 'teamA' | 'teamB';

interface QuarterLineupProps {
    quarter: number;
    /** 白チーム（App側で teamA=白 に固定されている） */
    teamA: Team;
    /** 青チーム */
    teamB: Team;
    /** 初期表示タブ（省略時は teamA） */
    initialTab?: LineupTabId;
    /** タブ切替時に呼ばれる。App側が次回の初期タブとして保持する */
    onTabChange?: (tab: LineupTabId) => void;
    /** 両チーム5名揃った状態で開始したときに1回だけ呼ばれる */
    onStart: (selected: { teamA: string[]; teamB: string[] }) => void;
    onBack?: () => void;
}

/** コート上かつ5ファウル未満の選手を初期選択にする */
const initialSelection = (players: Player[]) =>
    players.filter(p => p.isOnCourt && p.fouls.length < 5).map(p => p.id);

const TAB_IDS: LineupTabId[] = ['teamA', 'teamB'];

export function QuarterLineup({
    quarter,
    teamA,
    teamB,
    initialTab = 'teamA',
    onTabChange,
    onStart,
    onBack,
}: QuarterLineupProps) {
    const computeInitialSelected = () => ({
        teamA: initialSelection(teamA.players),
        teamB: initialSelection(teamB.players),
    });

    const [activeTab, setActiveTab] = useState<LineupTabId>(initialTab);
    const [selected, setSelected] = useState<Record<LineupTabId, string[]>>(computeInitialSelected);

    // クォーターが変わったら両チームの選択をリセット
    // （レンダー中の状態調整。useEffectでのcascading render警告を避けるため）
    const [prevQuarter, setPrevQuarter] = useState(quarter);
    if (quarter !== prevQuarter) {
        setPrevQuarter(quarter);
        setSelected(computeInitialSelected());
    }

    const teams: Record<LineupTabId, Team> = { teamA, teamB };
    const colorLabel = (team: Team) => (team.color === 'white' ? '白' : '青');
    const isComplete = (tab: LineupTabId) => selected[tab].length === PLAYERS_ON_COURT;

    const handleToggle = (playerId: string) => {
        setSelected(prev => {
            const ids = prev[activeTab];
            if (ids.includes(playerId)) {
                return { ...prev, [activeTab]: ids.filter(id => id !== playerId) };
            }
            if (ids.length >= PLAYERS_ON_COURT) {
                return prev;
            }
            return { ...prev, [activeTab]: [...ids, playerId] };
        });
    };

    const handleTabClick = (tab: LineupTabId) => {
        setActiveTab(tab);
        onTabChange?.(tab);
    };

    const isValid = isComplete('teamA') && isComplete('teamB');

    const handleStart = () => {
        if (isValid) {
            onStart({ teamA: selected.teamA, teamB: selected.teamB });
        }
    };

    // 未完了チームの案内（開始ボタンが無効な理由）
    const incompleteMessage = TAB_IDS
        .filter(tab => !isComplete(tab))
        .map(tab => `${colorLabel(teams[tab])}のスタメンが未選択です（${selected[tab].length}/${PLAYERS_ON_COURT}）`)
        .join(' / ');

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
                <h2>スタメン選択</h2>
            </div>

            {/* 白（teamA）が左・青（teamB）が右で固定。どちらからでも登録できる */}
            <div className="lineup-team-tabs" role="tablist">
                {TAB_IDS.map(tab => {
                    const team = teams[tab];
                    const count = selected[tab].length;
                    const done = isComplete(tab);
                    return (
                        <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab}
                            className={`lineup-team-tab ${team.color} ${activeTab === tab ? 'active' : ''} ${done ? 'complete' : ''}`}
                            onClick={() => handleTabClick(tab)}
                        >
                            <span className="lineup-team-tab-name">
                                <span className="lineup-team-tab-color">{colorLabel(team)}</span>
                                {team.name}
                            </span>
                            <span className="lineup-team-tab-count">
                                {count}/{PLAYERS_ON_COURT}{done ? ' ✓' : ''}
                            </span>
                        </button>
                    );
                })}
            </div>

            <LineupTeamPanel
                quarter={quarter}
                players={teams[activeTab].players}
                selectedIds={selected[activeTab]}
                onToggle={handleToggle}
            />

            <div className="quarter-lineup-actions">
                <button
                    className="btn btn-success btn-large"
                    onClick={handleStart}
                    disabled={!isValid}
                >
                    {quarter === 1 ? '試合開始' : `${quarterLabel} 開始`}
                </button>
            </div>

            {!isValid && <p className="lineup-incomplete-hint">{incompleteMessage}</p>}
        </div>
    );
}
