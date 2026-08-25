// 音声メモを1件だけ表示する帯。スコアボードの上に重ねて、
// 入力ボタンを動かさずに読めるようにする。
//
// ボタンが「済にする」と「たたむ」に分かれているのは役割が違うため:
// - 済にする … 入力し終えたので捨てる。残すと二重入力の元になる
// - たたむ  … メモは残したまま引っ込める。この帯はスコアボードを覆っており、
//             その下にはクォーター操作ボタンがある。そこへ手を伸ばしたいときに
//             「済」しか無いと、どかすためにメモを捨てることになってしまう
//
// Undo の状態とタイマーは App が持つ。ここに持てないのは、最後の1件を済にすると
// App の描画条件（memos.length > 0）が偽になって帯ごとアンマウントされ、
// 「元に戻す」が出る前に消えてしまうため。この層は表示専用にしておく。

import type { VoiceMemo } from '../../utils/voiceMemo';
import './VoiceMemo.css';

export interface VoiceMemoStripProps {
    memo: VoiceMemo;
    /** 一覧の全件数 */
    total: number;
    /** 何件目か（1始まり） */
    position: number;
    canRetry: boolean;
    onRetry: (id: string) => void;
    onDone: (id: string) => void;
    /** 猶予中に「元に戻す」対象として表示するメモ。null なら通常表示 */
    undoMemo: VoiceMemo | null;
    onUndo: () => void;
    onCollapse: () => void;
    onOpenList: () => void;
}

const formatTime = (createdAt: number) =>
    new Date(createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function VoiceMemoStrip({
    memo,
    total,
    position,
    canRetry,
    onRetry,
    onDone,
    undoMemo,
    onUndo,
    onCollapse,
    onOpenList,
}: VoiceMemoStripProps) {
    // 猶予中は本文も操作も出さない。消したはずのメモに対して
    // 「済にする」「再送」が押せると、二重に操作できてしまう
    if (undoMemo) {
        return (
            <div className="voice-memo-strip" role="status">
                <div className="voice-memo-strip-body">済にしました</div>
                <div className="voice-memo-strip-actions">
                    <button type="button" className="btn btn-secondary btn-small" onClick={onUndo}>
                        元に戻す
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="voice-memo-strip">
            <div className="voice-memo-strip-head">
                <span>Q{memo.quarter} / {formatTime(memo.createdAt)} ・ {position}件目 / 全{total}件</span>
                <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={onCollapse}
                    aria-label="音声メモをたたむ（メモは残ります）"
                >
                    ✕ たたむ
                </button>
            </div>

            <div className="voice-memo-strip-body">
                {memo.status === 'sending' && '⏳ 文字起こし中…'}
                {memo.status === 'done' && memo.text}
                {memo.status === 'failed' && `⚠️ 文字起こしに失敗しました（${memo.error ?? '理由不明'}）`}
            </div>

            <div className="voice-memo-strip-actions">
                <button type="button" className="btn btn-primary btn-small" onClick={() => onDone(memo.id)}>
                    済にする
                </button>
                {memo.status === 'failed' && canRetry && (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => onRetry(memo.id)}>
                        再送
                    </button>
                )}
                <button type="button" className="btn btn-secondary btn-small" onClick={onOpenList}>
                    一覧
                </button>
            </div>
        </div>
    );
}
