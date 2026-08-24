// 音声メモの一覧。常時表示せず、確認したいときだけ開く。
//
// スタッツには一切反映しない。ここは「読んで手入力するための下書き」であり、
// 入力し終わったものは削除して減らしていく使い方を想定している。

import { Modal } from '../Modal';
import type { VoiceMemo } from '../../utils/voiceMemo';
import './VoiceMemo.css';

export interface VoiceMemoPanelProps {
    memos: VoiceMemo[];
    onClose: () => void;
    onRetry: (id: string) => void;
    onRemove: (id: string) => void;
}

const formatTime = (createdAt: number) =>
    new Date(createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function VoiceMemoPanel({ memos, onClose, onRetry, onRemove }: VoiceMemoPanelProps) {
    // Sort memos by createdAt in ascending order
    const sortedMemos = [...memos].sort((a, b) => a.createdAt - b.createdAt);

    return (
        <Modal onClose={onClose} labelledBy="voice-memo-panel-title">
            <h3 id="voice-memo-panel-title">🎤 音声メモ</h3>
            <p className="section-description">
                吹き込んだメモの文字起こしです。スタッツには反映されません。
            </p>

            {sortedMemos.length === 0 ? (
                <p className="voice-memo-empty">音声メモはまだありません。</p>
            ) : (
                <div className="voice-memo-panel">
                    {sortedMemos.map(m => (
                        <div
                            key={m.id}
                            className={`voice-memo-item ${m.status === 'failed' ? 'is-failed' : ''}`}
                        >
                            <div className="voice-memo-item-head">
                                <span>Q{m.quarter} / {formatTime(m.createdAt)}</span>
                                <span>
                                    {m.status === 'failed' && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-small"
                                            onClick={() => onRetry(m.id)}
                                        >
                                            再送
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-small"
                                        onClick={() => onRemove(m.id)}
                                        aria-label={`このメモを削除 (Q${m.quarter} ${formatTime(m.createdAt)})`}
                                    >
                                        削除
                                    </button>
                                </span>
                            </div>

                            {m.status === 'sending' && <p className="voice-memo-item-text">⏳ 文字起こし中…</p>}
                            {m.status === 'done' && <p className="voice-memo-item-text">{m.text}</p>}
                            {m.status === 'failed' && (
                                <p className="voice-memo-item-text">⚠️ 文字起こしに失敗しました（{m.error}）</p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <button type="button" className="btn btn-primary btn-large" onClick={onClose}>
                閉じる
            </button>
        </Modal>
    );
}
