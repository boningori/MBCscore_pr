import { useState } from 'react';
import type { GameRecord } from '../../utils/gameHistoryStorage';
import { loadGameHistory, deleteGameRecord, updateGameRecordGameInfo } from '../../utils/gameHistoryStorage';
import { RunningScoresheet } from '../RunningScoresheet';
import { StatsPanel } from '../StatsPanel';
import type { Game, GameInfo } from '../../types/game';
import { createInitialGameInfo } from '../../types/game';
import {
    exportGame,
    downloadJSON,
    shareFile,
    generateGameFilename,
} from '../../utils/dataBackup';
import { showToast } from '../Toast/toastApi';
import './History.css';

interface HistoryProps {
    onBack: () => void;
}

export function History({ onBack }: HistoryProps) {
    // 初回マウント時のみ履歴を読み込む（遅延初期化）
    const [records, setRecords] = useState<GameRecord[]>(() => loadGameHistory());
    const [selectedRecord, setSelectedRecord] = useState<GameRecord | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'stats' | 'scoresheet'>('stats');

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteTargetId(id);
    };

    const confirmDelete = () => {
        if (deleteTargetId) {
            deleteGameRecord(deleteTargetId);
            setRecords(loadGameHistory());
            if (selectedRecord?.id === deleteTargetId) {
                setSelectedRecord(null);
            }
            setDeleteTargetId(null);
        }
    };

    const cancelDelete = () => {
        setDeleteTargetId(null);
    };

    const handleExportGame = async (e: React.MouseEvent, record: GameRecord) => {
        e.stopPropagation();

        const data = exportGame(record.id);
        if (!data) {
            showToast('試合データが見つかりませんでした', 'error');
            return;
        }

        const filename = generateGameFilename(record.gameName, record.date);

        // モバイルデバイスの場合はWeb Share APIを試す
        if ('share' in navigator && navigator.userAgent.match(/mobile/i)) {
            const shared = await shareFile(data, filename);
            if (shared) {
                return;
            }
        }

        // ダウンロード
        downloadJSON(data, filename);
    };

    // GameRecordからGame型に変換するヘルパー関数
    const recordToGame = (record: GameRecord): Game => ({
        id: record.id,
        teamA: record.teamA,
        teamB: record.teamB,
        scoreHistory: record.scoreHistory,
        statHistory: record.statHistory || [],
        foulHistory: record.foulHistory || [],
        currentQuarter: 4, // 終了した試合
        phase: 'finished',
        selectedPlayerId: null,
        selectedTeamId: null,
        startTime: record.date ? new Date(record.date) : null,
        endTime: new Date(record.createdAt),
        pendingActions: [],
        gameInfo: (record as { gameInfo?: GameInfo }).gameInfo || createInitialGameInfo(),
        showThreePoint: (record as { showThreePoint?: boolean }).showThreePoint ?? true,
    });

    if (selectedRecord) {
        return (
            <div className="history-detail-view">
                <div className="history-header">
                    <button className="btn btn-secondary" onClick={() => setSelectedRecord(null)}>
                        ← 一覧に戻る
                    </button>
                    <h2>{selectedRecord.gameName} ({new Date(selectedRecord.date).toLocaleDateString()})</h2>
                </div>

                <div className="history-tabs">
                    <button
                        className={viewMode === 'stats' ? 'active' : ''}
                        onClick={() => setViewMode('stats')}
                    >
                        スタッツ（画面表示）
                    </button>
                    <button
                        className={viewMode === 'scoresheet' ? 'active' : ''}
                        onClick={() => setViewMode('scoresheet')}
                    >
                        スコアシート（保存/PDF）
                    </button>
                </div>

                {viewMode === 'stats' && (
                    <div className="history-stats-view">
                        <StatsPanel players={selectedRecord.teamA.players} teamName={selectedRecord.teamA.name} isHistoryView={true} />
                        <div style={{ height: '32px' }}></div>
                        <StatsPanel players={selectedRecord.teamB.players} teamName={selectedRecord.teamB.name} isHistoryView={true} />
                    </div>
                )}

                {viewMode === 'scoresheet' && (
                    <RunningScoresheet
                        game={recordToGame(selectedRecord)}
                        gameName={selectedRecord.gameName}
                        date={selectedRecord.date ? new Date(selectedRecord.date).toLocaleDateString() : ''}
                        onClose={() => setViewMode('stats')}
                        onUpdateGameInfo={(partialInfo) => {
                            const currentGameInfo = selectedRecord.gameInfo || createInitialGameInfo();
                            const updatedGameInfo = { ...currentGameInfo, ...partialInfo };
                            updateGameRecordGameInfo(selectedRecord.id, updatedGameInfo);
                            setSelectedRecord({ ...selectedRecord, gameInfo: updatedGameInfo });
                        }}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="history-container">
            <div className="history-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    ← ホームへ
                </button>
                <h2>試合履歴</h2>
            </div>

            <div className="history-content">
                {records.length === 0 ? (
                    <div className="history-empty">
                        <p>保存された試合記録はありません</p>
                    </div>
                ) : (
                    <div className="history-list">
                        {records.map(record => (
                            <div
                                key={record.id}
                                className="history-card"
                                onClick={() => setSelectedRecord(record)}
                            >
                                <div className="history-card-header">
                                    <span className="history-date">
                                        {new Date(record.date).toLocaleDateString()}
                                    </span>
                                    <span className="history-title">{record.gameName}</span>
                                </div>
                                <div className="history-score">
                                    <div className="history-team team-left">
                                        <span className="team-name">
                                            {record.finalScore.teamA > record.finalScore.teamB && <span className="winner-star">★</span>}
                                            {record.teamA.name}
                                        </span>
                                        <span className="team-score-val">{record.finalScore.teamA}</span>
                                    </div>
                                    <span className="vs-divider">|</span>
                                    <div className="history-team team-right">
                                        <span className="team-name">
                                            {record.finalScore.teamB > record.finalScore.teamA && <span className="winner-star">★</span>}
                                            {record.teamB.name}
                                        </span>
                                        <span className="team-score-val">{record.finalScore.teamB}</span>
                                    </div>
                                </div>
                                <div className="history-card-actions">
                                    <button
                                        className="btn btn-secondary btn-small export-btn"
                                        onClick={(e) => handleExportGame(e, record)}
                                        title="この試合をエクスポート"
                                    >
                                        📤 共有
                                    </button>
                                    <button
                                        className="btn btn-danger btn-small delete-btn"
                                        onClick={(e) => handleDelete(e, record.id)}
                                    >
                                        削除
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 削除確認モーダル */}
            {deleteTargetId && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>試合記録の削除</h3>
                        <p>この試合記録を削除してもよろしいですか？</p>
                        <p className="text-muted text-sm my-2">※この操作は取り消せません</p>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={cancelDelete}>
                                キャンセル
                            </button>
                            <button className="btn btn-danger" onClick={confirmDelete}>
                                削除する
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
