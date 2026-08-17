import { useState, useMemo } from 'react';
import type { GameRecord } from '../../utils/gameHistoryStorage';
import { loadGameHistory, deleteGameRecord, updateGameRecordGameInfo, updateGameRecordEndTime } from '../../utils/gameHistoryStorage';
import { RunningScoresheet } from '../RunningScoresheet';
import { StatsPanel } from '../StatsPanel';
import type { Game, GameInfo } from '../../types/game';
import { createInitialGameInfo, DEFAULT_QUARTER_MINUTES } from '../../types/game';
import {
    exportGame,
    downloadJSON,
    shareFile,
    generateGameFilename,
} from '../../utils/dataBackup';
import { showToast } from '../Toast/toastApi';
import { formatRecordDate, recordInputDate } from '../../utils/localDate';
import { actionLabel } from '../../utils/actionLabels';
import { quarterLabel } from '../../utils/quarterLabel';
import { filterAndSortRecords, type HistoryOrder } from './historyFilter';
import { DeleteConfirmModal } from '../TeamShared';
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
    const [query, setQuery] = useState('');
    const [order, setOrder] = useState<HistoryOrder>('newest');

    const visibleRecords = useMemo(
        () => filterAndSortRecords(records, { query, order }),
        [records, query, order],
    );

    // 「開く」がカード全体ではなく専用のbuttonになったので、
    // 共有・削除のクリックがそちらへ伝わることはない（stopPropagation不要）
    const handleDelete = (id: string) => {
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

    const handleExportGame = async (record: GameRecord) => {
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
        // 記録者が入れた公式様式の終了時間。持たない旧レコードだけ、
        // 従来どおり保存時刻(createdAt)で代用する
        endTime: record.endTime ? new Date(record.endTime) : new Date(record.createdAt),
        pendingActions: [],
        gameInfo: (record as { gameInfo?: GameInfo }).gameInfo || createInitialGameInfo(),
        // 記録し始める前の試合には入っていない。既定は試合設定と同じ側に寄せる
        // （3P入力はミニバスでは通常OFF、クォーターはJBA公式の6分）
        showThreePoint: record.showThreePoint ?? false,
        quarterMinutes: record.quarterMinutes ?? DEFAULT_QUARTER_MINUTES,
    });

    if (selectedRecord) {
        return (
            <div className="history-detail-view">
                <div className="history-header">
                    <button className="btn btn-secondary" onClick={() => setSelectedRecord(null)}>
                        ← 一覧に戻る
                    </button>
                    <h1>{selectedRecord.gameName} ({formatRecordDate(selectedRecord.date)})</h1>
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

                {/*
                  選手を割り当てないまま終えた記録。どの選手のスタッツにも入って
                  いないので、上のスタッツ表にも最終スコアにも現れない。
                  保存はしていたのに読み出す画面が無く、事実上失われていた。
                */}
                {viewMode === 'stats' && (selectedRecord.pendingActions?.length ?? 0) > 0 && (
                    <div className="history-pending-section">
                        <h3>⏳ 未割り当ての記録（{selectedRecord.pendingActions!.length}件）</h3>
                        <p className="history-pending-note">
                            選手が決まらないまま試合を終えた記録です。
                            どの選手のスタッツにも入っておらず、最終スコアにも含まれていません。
                        </p>
                        <ul className="history-pending-list">
                            {selectedRecord.pendingActions!.map(pending => (
                                <li key={pending.id}>
                                    <span className="history-pending-quarter">
                                        {quarterLabel(pending.quarter)}
                                    </span>
                                    <span className="history-pending-team">
                                        {pending.teamId === 'teamA' ? selectedRecord.teamA.name : selectedRecord.teamB.name}
                                    </span>
                                    <span className="history-pending-action">
                                        {actionLabel(pending.actionType, pending.value)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {viewMode === 'stats' && (
                    <div className="history-stats-view">
                        <StatsPanel
                            players={selectedRecord.teamA.players}
                            teamName={selectedRecord.teamA.name}
                            isHistoryView={true}
                            teamId="teamA"
                            statHistory={selectedRecord.statHistory}
                        />
                        <div style={{ height: '32px' }}></div>
                        <StatsPanel
                            players={selectedRecord.teamB.players}
                            teamName={selectedRecord.teamB.name}
                            isHistoryView={true}
                            teamId="teamB"
                            statHistory={selectedRecord.statHistory}
                        />
                    </div>
                )}

                {/*
                  スコアシートは date を「年/月/日」に割って公式様式の日付欄へ入れる。
                  toLocaleDateString() は端末のロケール次第で並びが変わり、
                  英語ロケールでは 6/5/2026 → 年6・月5・日2026 になっていた。
                  試合中の画面と同じ YYYY-MM-DD で渡す
                */}
                {viewMode === 'scoresheet' && (
                    <RunningScoresheet
                        game={recordToGame(selectedRecord)}
                        gameName={selectedRecord.gameName}
                        date={recordInputDate(selectedRecord.date)}
                        onClose={() => setViewMode('stats')}
                        onUpdateGameInfo={(partialInfo) => {
                            const currentGameInfo = selectedRecord.gameInfo || createInitialGameInfo();
                            const updatedGameInfo = { ...currentGameInfo, ...partialInfo };
                            updateGameRecordGameInfo(selectedRecord.id, updatedGameInfo);
                            setSelectedRecord({ ...selectedRecord, gameInfo: updatedGameInfo });
                        }}
                        // 終了時間は gameInfo とは別フィールド。渡さないと、入力欄は
                        // 編集できて保存も押せるのに値がどこにも行かない
                        onEndTimeChange={(endTime) => {
                            updateGameRecordEndTime(selectedRecord.id, endTime);
                            setSelectedRecord({
                                ...selectedRecord,
                                endTime: endTime ? new Date(endTime).toISOString() : undefined,
                            });
                        }}
                    />
                )}
            </div>
        );
    }

    return (
        <main className="history-container">
            <div className="history-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    ← ホームへ
                </button>
                <h1>試合履歴</h1>
            </div>

            {/*
              絞り込みの操作子は結果が0件でも描画する。
              条件を変える手段が消えると、その条件から抜け出せなくなる
            */}
            {records.length > 0 && (
                <div className="history-controls">
                    <div className="history-search">
                        <label className="history-field-label" htmlFor="history-search-input">検索：</label>
                        <input
                            id="history-search-input"
                            type="search"
                            className="input"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="試合名・チーム名・日付"
                        />
                        {query && (
                            <button
                                className="btn-reset"
                                onClick={() => setQuery('')}
                                aria-label="検索条件を消す"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <div className="history-order">
                        <label className="history-field-label" htmlFor="history-order-select">並び順：</label>
                        <select
                            id="history-order-select"
                            className="input"
                            value={order}
                            onChange={e => setOrder(e.target.value as HistoryOrder)}
                        >
                            <option value="newest">新しい順</option>
                            <option value="oldest">古い順</option>
                        </select>
                    </div>
                    <span className="history-count">{visibleRecords.length} / {records.length}件</span>
                </div>
            )}

            <div className="history-content">
                {records.length === 0 ? (
                    <div className="history-empty">
                        <p>保存された試合記録はありません</p>
                    </div>
                ) : visibleRecords.length === 0 ? (
                    // 「記録がない」と「検索で消えた」を混同しない
                    <div className="history-empty">
                        <p>「{query}」に一致する試合はありません</p>
                    </div>
                ) : (
                    <div className="history-list">
                        {visibleRecords.map(record => (
                            <div key={record.id} className="history-card">
                                {/*
                                  カード全体をbuttonにはできない（中の共有・削除と入れ子になる）。
                                  「開く」操作だけをbuttonに切り出して、キーボードから到達できるようにする
                                */}
                                <button
                                    type="button"
                                    className="history-card-main"
                                    onClick={() => setSelectedRecord(record)}
                                >
                                    <span className="history-card-header">
                                        <span className="history-date">
                                            {formatRecordDate(record.date)}
                                        </span>
                                        <span className="history-title">{record.gameName}</span>
                                    </span>
                                    <span className="history-score">
                                        <span className="history-team team-left">
                                            <span className="team-name">
                                                {record.finalScore.teamA > record.finalScore.teamB && <span className="winner-star">★</span>}
                                                {record.teamA.name}
                                            </span>
                                            <span className="team-score-val">{record.finalScore.teamA}</span>
                                        </span>
                                        <span className="vs-divider">|</span>
                                        <span className="history-team team-right">
                                            <span className="team-name">
                                                {record.finalScore.teamB > record.finalScore.teamA && <span className="winner-star">★</span>}
                                                {record.teamB.name}
                                            </span>
                                            <span className="team-score-val">{record.finalScore.teamB}</span>
                                        </span>
                                    </span>
                                </button>
                                <div className="history-card-actions">
                                    <button
                                        className="btn btn-secondary btn-small export-btn"
                                        onClick={() => handleExportGame(record)}
                                        title="この試合をエクスポート"
                                    >
                                        📤 共有
                                    </button>
                                    <button
                                        className="btn btn-danger btn-small delete-btn"
                                        onClick={() => handleDelete(record.id)}
                                    >
                                        削除
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 削除確認モーダル。素のオーバーレイを手書きしていたため
                dialog・フォーカストラップ・Escapeが無かった。
                他画面の削除確認と同じ ConfirmModal に揃える */}
            {deleteTargetId && (
                <DeleteConfirmModal
                    title="試合記録の削除"
                    message="この試合記録を削除してもよろしいですか？"
                    note="※この操作は取り消せません"
                    onConfirm={confirmDelete}
                    onCancel={cancelDelete}
                />
            )}
        </main>
    );
}
