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

// アクセシブルネームに付ける、行を識別するための短い説明。
// Q・時刻は分単位までしか出ないため、早口の口述筆記では同一クォーター・同一分の
// メモが並ぶことが普通にある。「何件目か」という並び順は常に一意なので必ず含め、
// それに加えて読み上げで一番役立つ情報（文字起こし済みならその冒頭、まだ無ければ
// 状態）を添える。
const describeMemoForA11y = (m: VoiceMemo, position: number): string => {
    const ordinal = `${position}件目`;
    if (m.status === 'sending') {
        return `${ordinal}、文字起こし中`;
    }
    if (m.status === 'failed') {
        return m.error ? `${ordinal}、文字起こし失敗（${m.error}）` : `${ordinal}、文字起こし失敗`;
    }
    const text = m.text?.trim();
    if (!text) {
        return ordinal;
    }
    const snippet = text.length > 20 ? `${text.slice(0, 20)}…` : text;
    return `${ordinal}、${snippet}`;
};

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
                    {sortedMemos.map((m, index) => (
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
                                            aria-label={`このメモを再送 (Q${m.quarter} ${formatTime(m.createdAt)}、${describeMemoForA11y(m, index + 1)})`}
                                        >
                                            再送
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-small"
                                        onClick={() => onRemove(m.id)}
                                        aria-label={`このメモを削除 (Q${m.quarter} ${formatTime(m.createdAt)}、${describeMemoForA11y(m, index + 1)})`}
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
