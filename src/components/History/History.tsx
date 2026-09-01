import { useState, useMemo, useCallback } from 'react';
import type { GameRecord } from '../../utils/gameHistoryStorage';
import { loadGameHistory, deleteGameRecord, updateGameRecordGameInfo, updateGameRecordEndTime, resolveFinalScore } from '../../utils/gameHistoryStorage';
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
import { useBackHandler } from '../../hooks/useBackHandler';
import { migrateTeam } from '../../utils/migrateTeam';
import { TeamComparison } from '../TeamComparison';
import { buildComparisonCaption } from '../TeamComparison/comparisonCaption';
import './History.css';

interface HistoryProps {
    onBack: () => void;
}

export function History({ onBack }: HistoryProps) {
    // 初回マウント時のみ履歴を読み込む（遅延初期化）
    const [records, setRecords] = useState<GameRecord[]>(() => loadGameHistory());
    const [selectedRecord, setSelectedRecord] = useState<GameRecord | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'comparison' | 'stats' | 'scoresheet'>('comparison');
    const [query, setQuery] = useState('');
    const [order, setOrder] = useState<HistoryOrder>('newest');

    const visibleRecords = useMemo(
        () => filterAndSortRecords(records, { query, order }),
        [records, query, order],
    );

    // 端末の戻る操作は試合詳細を閉じて一覧へ。ここを受け取らないと、画面上の
    // 「← 一覧に戻る」と挙動が食い違い、ホームまで飛ぶ（useBackHandler）。
    //
    // 様式を開いているときは、まず様式を閉じてスタッツ表示へ戻す。画面上の
    // 「閉じる」が1段だけ戻すのに、端末の戻るだけ詳細ごと閉じていたため、
    // 同じ「戻る」で行き先が食い違っていた（App のスコアシート画面と同じ扱い）
    useBackHandler(selectedRecord !== null, () => {
        if (viewMode === 'scoresheet') {
            setViewMode('comparison');
            return;
        }
        setSelectedRecord(null);
    });

    /**
     * 保存した内容を、開いている詳細と一覧の複製の両方へ反映する。
     *
     * 一覧（records）はマウント時に1回だけ読み込んでいる。詳細側だけ更新すると
     * 一覧の複製が古いまま残り、一覧に戻って開き直した時点で入力が消えて見える。
     * さらに次の編集はその古い複製を土台に上書きするため、前に入れた項目が
     * 本当に失われていた（実測: 会場を入れた後にクルーチーフを入れると会場が空に戻る）。
     *
     * 差し替えではなく更新関数を受けるのは、1回の保存で2つの更新が続けて走るため。
     * 試合情報モーダルの「保存」は onSave と onEndTimeChange を順に呼ぶので、
     * それぞれが同じレンダーで捕まえた selectedRecord から新しい値を組み立てると、
     * あとから走ったほうが前の変更ごと上書きする（実測: 終了時間の更新が
     * 会場の入力を巻き戻していた）。
     */
    const applyRecordUpdate = useCallback((id: string, update: (record: GameRecord) => GameRecord) => {
        setSelectedRecord(prev => (prev && prev.id === id ? update(prev) : prev));
        setRecords(prev => prev.map(r => (r.id === id ? update(r) : r)));
    }, []);

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

    /** 読める日時だけ Date にする（読めなければ null。Invalid Date を作らない） */
    const readableDate = (value: string | undefined): Date | null => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };

    // GameRecordからGame型に変換するヘルパー関数
    const recordToGame = (record: GameRecord): Game => ({
        id: record.id,
        // 手で編集したバックアップや古い記録は、後から足した配列を持たないことがある。
        // 様式は添字で引くので、欠けたまま渡すと画面ごと落ちる（utils/migrateTeam）
        teamA: migrateTeam(record.teamA),
        teamB: migrateTeam(record.teamB),
        scoreHistory: record.scoreHistory,
        statHistory: record.statHistory || [],
        foulHistory: record.foulHistory || [],
        currentQuarter: 4, // 終了した試合
        phase: 'finished',
        selectedPlayerId: null,
        selectedTeamId: null,
        startTime: readableDate(record.date),
        // 記録者が入れた公式様式の終了時間。持たない旧レコードだけ、
        // 従来どおり保存時刻(createdAt)で代用する。
        // どちらも読めないレコード（手で編集した／途中で切れたバックアップ）で
        // Invalid Date を作らない —— 様式側が truthy と見て「NaN:NaN」を印字する
        endTime: readableDate(record.endTime) ?? readableDate(record.createdAt),
        pendingActions: [],
        gameInfo: (record as { gameInfo?: GameInfo }).gameInfo || createInitialGameInfo(),
        // 記録し始める前の試合には入っていない。既定は試合設定と同じ側に寄せる
        // （3P入力はミニバスでは通常OFF、クォーターはJBA公式の6分）
        showThreePoint: record.showThreePoint ?? false,
        quarterMinutes: record.quarterMinutes ?? DEFAULT_QUARTER_MINUTES,
    });

    if (selectedRecord) {
        // 詳細の3つのタブは、どれも欠けたフィールドを添字や素のプロパティで引く
        // （様式のコーチ行、チーム比較とスタッツ表の p.stats.points）。
        // タブごとに migrateTeam を掛け忘れると、そのタブだけが落ちる —— 実際
        // スタッツ表は素の players を受け取っていて、stats を欠くレコードで
        // アプリ全体がエラー画面になっていた。入口で1度だけ通して全タブで使う。
        const teamA = migrateTeam(selectedRecord.teamA);
        const teamB = migrateTeam(selectedRecord.teamB);

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
                        className={viewMode === 'comparison' ? 'active' : ''}
                        onClick={() => setViewMode('comparison')}
                    >
                        チーム比較
                    </button>
                    <button
                        className={viewMode === 'stats' ? 'active' : ''}
                        onClick={() => setViewMode('stats')}
                    >
                        {/* 狭い画面での折り返し位置。括弧の途中で切れないよう、
                            括弧の前だけを改行の候補にする（CSS の word-break: keep-all と対） */}
                        スタッツ<wbr />（画面表示）
                    </button>
                    <button
                        className={viewMode === 'scoresheet' ? 'active' : ''}
                        onClick={() => setViewMode('scoresheet')}
                    >
                        スコアシート<wbr />（保存/PDF）
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

                {viewMode === 'comparison' && (
                    <div className="history-comparison-view">
                        <TeamComparison
                            teamA={teamA}
                            teamB={teamB}
                            // 手で編集したバックアップや古い記録は配列を持たないことがある（recordToGame参照）
                            scoreHistory={selectedRecord.scoreHistory || []}
                            statHistory={selectedRecord.statHistory || []}
                            foulHistory={selectedRecord.foulHistory || []}
                            showThreePoint={selectedRecord.showThreePoint}
                            // 試合名が「日付 vs 対戦相手」の自動生成（GameSetup参照）で
                            // 記録日と同じ日付から始まる場合は、日付を重ねて出さない
                            caption={buildComparisonCaption({
                                date: selectedRecord.date,
                                gameName: selectedRecord.gameName,
                                location: selectedRecord.location,
                            })}
                            exportable
                            exportName={selectedRecord.gameName}
                        />
                    </div>
                )}

                {viewMode === 'stats' && (
                    <div className="history-stats-view">
                        <StatsPanel
                            players={teamA.players}
                            teamName={teamA.name}
                            isHistoryView={true}
                            teamId="teamA"
                            statHistory={selectedRecord.statHistory}
                        />
                        <div style={{ height: '32px' }}></div>
                        <StatsPanel
                            players={teamB.players}
                            teamName={teamB.name}
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
                        onClose={() => setViewMode('comparison')}
                        // 画面へ反映するのは保存できたときだけ。
                        //
                        // 更新関数の戻り値を捨てていたため、容量が尽きて
                        // localStorage に書けていなくても、ここがメモリ上の複製を
                        // 更新して「入力が反映された画面」を出していた。利用者は
                        // 保存できたと思うが、再読み込みすると消えている。
                        // 端末内だけでデータを持つアプリなので、失敗は必ず見せる
                        onUpdateGameInfo={(partialInfo) => {
                            const currentGameInfo = selectedRecord.gameInfo || createInitialGameInfo();
                            const updatedGameInfo = { ...currentGameInfo, ...partialInfo };
                            if (!updateGameRecordGameInfo(selectedRecord.id, updatedGameInfo)) {
                                showToast('試合情報を保存できませんでした（端末の空き容量をご確認ください）', 'error');
                                return;
                            }
                            applyRecordUpdate(selectedRecord.id, r => ({ ...r, gameInfo: updatedGameInfo }));
                        }}
                        // 終了時間は gameInfo とは別フィールド。渡さないと、入力欄は
                        // 編集できて保存も押せるのに値がどこにも行かない
                        // 反映は保存できたときだけ（onUpdateGameInfo のコメント）
                        onEndTimeChange={(endTime) => {
                            if (!updateGameRecordEndTime(selectedRecord.id, endTime)) {
                                showToast('終了時間を保存できませんでした（端末の空き容量をご確認ください）', 'error');
                                return;
                            }
                            applyRecordUpdate(selectedRecord.id, r => ({
                                ...r,
                                endTime: endTime ? new Date(endTime).toISOString() : undefined,
                            }));
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
                        {visibleRecords.map(record => {
                            // finalScore を欠くレコード（手で編集したバックアップ由来）でも
                            // 一覧が落ちないよう組み直してから読む（resolveFinalScore）
                            const finalScore = resolveFinalScore(record);
                            return (
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
                                                {finalScore.teamA > finalScore.teamB && <span className="winner-star">★</span>}
                                                {record.teamA.name}
                                            </span>
                                            <span className="team-score-val">{finalScore.teamA}</span>
                                        </span>
                                        {/* 両チーム名の間の区切り。意味を持たない飾りなので
                                            読み上げから外す（読ませると「たてぼう」が挟まる）。
                                            コントラストも 2.26:1 と低いが、装飾テキストは
                                            WCAG 1.4.3 の対象外。aria-hidden で意図を明示する */}
                                        <span className="vs-divider" aria-hidden="true">|</span>
                                        <span className="history-team team-right">
                                            <span className="team-name">
                                                {finalScore.teamB > finalScore.teamA && <span className="winner-star">★</span>}
                                                {record.teamB.name}
                                            </span>
                                            <span className="team-score-val">{finalScore.teamB}</span>
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
                            );
                        })}
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
