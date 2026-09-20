import { useState } from 'react';
import type { Player, Team } from '../../types/game';
import { PLAYERS_ON_COURT } from '../../types/game';
import { isDisqualified } from '../../utils/disqualification';
import { quarterLabel } from '../../utils/quarterLabel';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { resolveMyTeamSide, orderByMyTeam } from '../../utils/myTeamSide';
import { AddPlayersPanel, type NewPlayerInput } from './AddPlayersPanel';
import { LineupTeamPanel } from './LineupTeamPanel';
import './QuarterLineup.css';

export type LineupTabId = 'teamA' | 'teamB';

interface QuarterLineupProps {
    quarter: number;
    /** 白チーム（データ上 teamA=白 に固定。画面での左右はマイチーム基準で入れ替わる） */
    teamA: Team;
    /** 青チーム */
    teamB: Team;
    /** 初期表示タブ（省略時はマイチーム側。決められないときは teamA） */
    initialTab?: LineupTabId;
    /** タブ切替時に呼ばれる。App側が次回の初期タブとして保持する */
    onTabChange?: (tab: LineupTabId) => void;
    /** 両チーム5名揃った状態で開始したときに1回だけ呼ばれる */
    onStart: (selected: { teamA: string[]; teamB: string[] }) => void;
    /** 名簿から漏れた選手を追加する。省略すると追加の入口を出さない */
    onAddPlayers?: (teamId: LineupTabId, players: NewPlayerInput[]) => void;
    onBack?: () => void;
}

/** コート上かつ退場・失格していない選手を初期選択にする */
const initialSelection = (players: Player[]) =>
    players.filter(p => p.isOnCourt && !isDisqualified(p.fouls)).map(p => p.id);

export function QuarterLineup({
    quarter,
    teamA,
    teamB,
    initialTab,
    onTabChange,
    onStart,
    onAddPlayers,
    onBack,
}: QuarterLineupProps) {
    const computeInitialSelected = () => ({
        teamA: initialSelection(teamA.players),
        teamB: initialSelection(teamB.players),
    });

    // マイチームのタブを先頭に置く。各クォーターの開始時に必ず通り、しかも
    // 「自分の5人を選ぶ」画面なので、記録画面と並びが食い違うと迷いが起きる。
    // 決められないとき（紅白戦・旧データ）は従来どおり白が先頭
    const myTeamSide = resolveMyTeamSide(teamA, teamB);
    const tabIds = orderByMyTeam(myTeamSide);

    const [activeTab, setActiveTab] = useState<LineupTabId>(initialTab ?? tabIds[0]);
    const [selected, setSelected] = useState<Record<LineupTabId, string[]>>(computeInitialSelected);

    // 追加パネルの開閉と、閉じた直後の状況表示。
    // 追加は取り消せないので、何を足したのかを画面に残す
    const [addingPlayers, setAddingPlayers] = useState(false);
    const [addedNotice, setAddedNotice] = useState<string | null>(null);

    // クォーターが変わったら両チームの選択をリセット
    // （レンダー中の状態調整。useEffectでのcascading render警告を避けるため）
    const [prevQuarter, setPrevQuarter] = useState(quarter);
    if (quarter !== prevQuarter) {
        setPrevQuarter(quarter);
        setSelected(computeInitialSelected());
        setAddedNotice(null);
    }

    const teams: Record<LineupTabId, Team> = { teamA, teamB };
    const colorLabel = (team: Team) => (team.color === 'white' ? '白' : '青');
    const teamScore = (team: Team) => team.players.reduce((sum, p) => sum + p.stats.points, 0);
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
        setAddedNotice(null);
        onTabChange?.(tab);
    };

    const isValid = isComplete('teamA') && isComplete('teamB');

    const handleStart = () => {
        if (isValid) {
            onStart({ teamA: selected.teamA, teamB: selected.teamB });
        }
    };

    const handleAddPlayers = (added: NewPlayerInput[]) => {
        onAddPlayers?.(activeTab, added);
        setAddingPlayers(false);
        // どのチームへの追加かをタブ取り違えに後から気づけるよう文言に含める
        const numbers = added.map(p => `#${formatPlayerNumber(p.number)}`).join(' ');
        setAddedNotice(`${teams[activeTab].name} に ${numbers} を追加しました`);
    };

    // 未完了チームの案内（開始ボタンが無効な理由）
    const incompleteMessage = tabIds
        .filter(tab => !isComplete(tab))
        .map(tab => `${colorLabel(teams[tab])}のスタメンが未選択です（${selected[tab].length}/${PLAYERS_ON_COURT}）`)
        .join(' / ');

    // クォーター色（1Q/3Qは赤、2Q/4Q/OTは黒）
    const isOT = quarter > 4;
    const quarterClass = isOT ? 'q-even' : (quarter === 1 || quarter === 3 ? 'q-odd' : 'q-even');
    // 表記は共通のヘルパーに集約する（utils/quarterLabel）
    const periodLabel = quarterLabel(quarter);

    return (
        <main className="quarter-lineup">
            <div className="quarter-lineup-header">
                {onBack && (
                    <button className="btn btn-secondary" onClick={onBack}>
                        ← 戻る
                    </button>
                )}
                <div className={`quarter-badge ${quarterClass}`}>
                    {periodLabel}
                </div>
                <h1>スタメン選択</h1>
            </div>

            {/* この画面のままスコアを確認できるようにする（確認のために戻る操作を不要にする） */}
            <div className="quarter-lineup-score" aria-label="現在のスコア">
                {tabIds.map(tab => {
                    const team = teams[tab];
                    return (
                        <div key={tab} className={`lineup-score-team ${team.color}`}>
                            <span className="lineup-score-name">
                                <span className="lineup-score-color">{colorLabel(team)}</span>
                                <span className="lineup-score-team-name">{team.name}</span>
                            </span>
                            <span className="lineup-score-points">{teamScore(team)}</span>
                        </div>
                    );
                })}
            </div>

            {/* マイチームのタブが先頭。どちらからでも登録できる */}
            <div className="lineup-team-tabs" role="tablist">
                {tabIds.map(tab => {
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
                                {/* 色だけが手掛かりにならないよう、位置に加えて読み上げでも伝える。
                                    虹（is-my-team）は選択状態の色表現とぶつかるため付けない */}
                                {tab === myTeamSide && <span className="sr-only">マイチーム</span>}
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
                onRequestAddPlayer={onAddPlayers ? () => {
                    // パネルを開いたら前回の追加通知を消す。残したままだと
                    // パネルの裏でrole="status"が2つ同時に存在してしまう
                    setAddedNotice(null);
                    setAddingPlayers(true);
                } : undefined}
                addedNotice={addedNotice ?? undefined}
            />

            {addingPlayers && (
                <AddPlayersPanel
                    teamName={teams[activeTab].name}
                    teamColor={teams[activeTab].color}
                    players={teams[activeTab].players}
                    onSubmit={handleAddPlayers}
                    onClose={() => setAddingPlayers(false)}
                />
            )}

            <div className="quarter-lineup-actions">
                <button
                    className="btn btn-success btn-large"
                    onClick={handleStart}
                    disabled={!isValid}
                >
                    {quarter === 1 ? '試合開始' : `${periodLabel} 開始`}
                </button>
            </div>

            {!isValid && <p className="lineup-incomplete-hint">{incompleteMessage}</p>}
        </main>
    );
}
