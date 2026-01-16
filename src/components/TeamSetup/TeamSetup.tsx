import { useState } from 'react';
import type { Team, Player } from '../../types/game';
import { createTeam, createPlayer, MAX_PLAYERS_PER_TEAM, PLAYERS_ON_COURT } from '../../types/game';
import './TeamSetup.css';

interface TeamSetupProps {
    onComplete: (teamA: Team, teamB: Team) => void;
}

export function TeamSetup({ onComplete }: TeamSetupProps) {
    const [step, setStep] = useState<'teamA' | 'teamB' | 'confirm'>('teamA');
    const [teamA, setTeamA] = useState<Team>(createTeam('teamA', '', ''));
    const [teamB, setTeamB] = useState<Team>(createTeam('teamB', '', ''));

    const handleTeamComplete = (team: Team, isTeamA: boolean) => {
        if (isTeamA) {
            setTeamA(team);
            setStep('teamB');
        } else {
            setTeamB(team);
            setStep('confirm');
        }
    };

    const handleConfirm = () => {
        onComplete(teamA, teamB);
    };

    const handleBack = () => {
        if (step === 'teamB') setStep('teamA');
        else if (step === 'confirm') setStep('teamB');
    };

    if (step === 'confirm') {
        return (
            <div className="setup-container">
                <h1 className="setup-title">チーム確認</h1>

                <div className="team-confirm-grid">
                    <TeamConfirmCard team={teamA} label="チームA" />
                    <TeamConfirmCard team={teamB} label="チームB" />
                </div>

                <div className="setup-actions">
                    <button className="btn btn-secondary btn-large" onClick={handleBack}>
                        戻る
                    </button>
                    <button className="btn btn-success btn-large" onClick={handleConfirm}>
                        試合開始
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="setup-container">
            <h1 className="setup-title">
                {step === 'teamA' ? 'チームA 登録' : 'チームB 登録'}
            </h1>
            <TeamForm
                team={step === 'teamA' ? teamA : teamB}
                onComplete={(team) => handleTeamComplete(team, step === 'teamA')}
                onBack={step === 'teamB' ? handleBack : undefined}
            />
        </div>
    );
}

// チーム入力フォーム
interface TeamFormProps {
    team: Team;
    onComplete: (team: Team) => void;
    onBack?: () => void;
}

function TeamForm({ team, onComplete, onBack }: TeamFormProps) {
    const [name, setName] = useState(team.name);
    const [coachName, setCoachName] = useState(team.coachName);
    const [players, setPlayers] = useState<Player[]>(team.players);
    const [newPlayerNumber, setNewPlayerNumber] = useState('');
    const [newPlayerName, setNewPlayerName] = useState('');

    const addPlayer = () => {
        if (!newPlayerNumber || !newPlayerName) return;
        const number = parseInt(newPlayerNumber, 10);
        if (isNaN(number) || number < 0 || number > 99) return;
        if (players.some(p => p.number === number)) return;
        if (players.length >= MAX_PLAYERS_PER_TEAM) return;

        const newPlayer = createPlayer(
            crypto.randomUUID(),
            number,
            newPlayerName,
            false
        );

        const updatedPlayers = [...players, newPlayer].sort((a, b) => a.number - b.number);
        setPlayers(updatedPlayers);
        setNewPlayerNumber('');
        setNewPlayerName('');
    };

    const removePlayer = (playerId: string) => {
        setPlayers(players.filter(p => p.id !== playerId));
    };

    const toggleCaptain = (playerId: string) => {
        setPlayers(players.map(p => ({
            ...p,
            isCaptain: p.id === playerId ? !p.isCaptain : false
        })));
    };

    const toggleOnCourt = (playerId: string) => {
        const onCourtCount = players.filter(p => p.isOnCourt).length;
        const player = players.find(p => p.id === playerId);
        if (!player) return;

        if (player.isOnCourt) {
            setPlayers(players.map(p =>
                p.id === playerId ? { ...p, isOnCourt: false } : p
            ));
        } else if (onCourtCount < PLAYERS_ON_COURT) {
            setPlayers(players.map(p =>
                p.id === playerId ? { ...p, isOnCourt: true } : p
            ));
        }
    };

    const handleSubmit = () => {
        if (!name || players.length < PLAYERS_ON_COURT) return;
        const onCourtCount = players.filter(p => p.isOnCourt).length;
        if (onCourtCount !== PLAYERS_ON_COURT) return;

        onComplete({
            ...team,
            name,
            coachName,
            players,
        });
    };

    const onCourtCount = players.filter(p => p.isOnCourt).length;
    const isValid = name && players.length >= PLAYERS_ON_COURT && onCourtCount === PLAYERS_ON_COURT;

    return (
        <div className="team-form">
            <div className="form-section">
                <label className="form-label">チーム名 *</label>
                <input
                    type="text"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="チーム名を入力"
                />
            </div>

            <div className="form-section">
                <label className="form-label">コーチ名</label>
                <input
                    type="text"
                    className="input"
                    value={coachName}
                    onChange={(e) => setCoachName(e.target.value)}
                    placeholder="コーチ名を入力"
                />
            </div>

            <div className="form-section">
                <label className="form-label">
                    選手登録 ({players.length}/{MAX_PLAYERS_PER_TEAM})
                </label>
                <div className="add-player-row">
                    <input
                        type="number"
                        className="input player-number-input"
                        value={newPlayerNumber}
                        onChange={(e) => setNewPlayerNumber(e.target.value)}
                        placeholder="背番号"
                        min="0"
                        max="99"
                    />
                    <input
                        type="text"
                        className="input player-name-input"
                        value={newPlayerName}
                        onChange={(e) => setNewPlayerName(e.target.value)}
                        placeholder="選手名"
                        onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={addPlayer}
                        disabled={!newPlayerNumber || !newPlayerName || players.length >= MAX_PLAYERS_PER_TEAM}
                    >
                        追加
                    </button>
                </div>
            </div>

            <div className="form-section">
                <div className="court-status">
                    コート上: {onCourtCount}/{PLAYERS_ON_COURT}
                    {onCourtCount !== PLAYERS_ON_COURT && (
                        <span className="text-muted"> (5名選択してください)</span>
                    )}
                </div>
                <div className="players-list">
                    {players.map(player => (
                        <div
                            key={player.id}
                            className={`player-setup-card ${player.isOnCourt ? 'on-court' : ''}`}
                        >
                            <div className="player-number">{player.number}</div>
                            <div className="player-name-container">
                                <span className={`player-name ${player.isCaptain ? 'captain' : ''}`}>
                                    {player.name}
                                </span>
                            </div>
                            <div className="player-setup-actions">
                                <button
                                    className={`btn btn-small ${player.isCaptain ? 'btn-warning' : 'btn-secondary'}`}
                                    onClick={() => toggleCaptain(player.id)}
                                    title="キャプテン"
                                >
                                    C
                                </button>
                                <button
                                    className={`btn btn-small ${player.isOnCourt ? 'btn-success' : 'btn-secondary'}`}
                                    onClick={() => toggleOnCourt(player.id)}
                                    title="コート上"
                                >
                                    {player.isOnCourt ? '✓' : '○'}
                                </button>
                                <button
                                    className="btn btn-small btn-danger"
                                    onClick={() => removePlayer(player.id)}
                                    title="削除"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="setup-actions">
                {onBack && (
                    <button className="btn btn-secondary btn-large" onClick={onBack}>
                        戻る
                    </button>
                )}
                <button
                    className="btn btn-primary btn-large"
                    onClick={handleSubmit}
                    disabled={!isValid}
                >
                    次へ
                </button>
            </div>
        </div>
    );
}

// チーム確認カード
function TeamConfirmCard({ team, label }: { team: Team; label: string }) {
    const onCourtPlayers = team.players.filter(p => p.isOnCourt);
    const benchPlayers = team.players.filter(p => !p.isOnCourt);

    return (
        <div className="team-confirm-card">
            <h3 className="team-confirm-header">
                {label}: {team.name}
            </h3>
            {team.coachName && (
                <p className="text-secondary">コーチ: {team.coachName}</p>
            )}

            <div className="mt-md">
                <h4 className="text-sm text-muted mb-sm">スターティング5</h4>
                <div className="players-mini-list">
                    {onCourtPlayers.map(p => (
                        <span key={p.id} className="player-mini">
                            #{p.number} {p.name}{p.isCaptain ? ' (C)' : ''}
                        </span>
                    ))}
                </div>
            </div>

            {benchPlayers.length > 0 && (
                <div className="mt-md">
                    <h4 className="text-sm text-muted mb-sm">ベンチ</h4>
                    <div className="players-mini-list">
                        {benchPlayers.map(p => (
                            <span key={p.id} className="player-mini">
                                #{p.number} {p.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
