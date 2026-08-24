// 音声メモのデータ構造と、一覧に対する純粋な操作。
//
// 保存も通信もここでは行わない。特に「並び順」はこの層の責務にしている。
// 数秒の口述を連射すると送信は並列になり、通信状況次第で後の発話が先に返る。
// 応答順に積むとプレーの前後が入れ替わってメモとして使えなくなるため、
// 常に録音開始時刻(createdAt)の昇順で持つ。

export interface VoiceMemo {
    id: string;
    /** 記録時のクォーター */
    quarter: number;
    /** 録音開始時刻。発話順の並び替えキー */
    createdAt: number;
    status: 'sending' | 'done' | 'failed';
    /** status === 'done' のとき */
    text?: string;
    /** status === 'failed' のとき */
    error?: string;
}

export interface TranscriptionOutcome {
    success: boolean;
    text?: string;
    error?: string;
}

export function sortMemos(memos: VoiceMemo[]): VoiceMemo[] {
    return [...memos].sort((a, b) => a.createdAt - b.createdAt);
}

export function appendMemo(memos: VoiceMemo[], memo: VoiceMemo): VoiceMemo[] {
    return sortMemos([...memos, memo]);
}

export function applyTranscription(
    memos: VoiceMemo[],
    id: string,
    result: TranscriptionOutcome,
): VoiceMemo[] {
    return memos.map(m => {
        if (m.id !== id) return m;
        if (result.success) {
            return { ...m, status: 'done' as const, text: result.text, error: undefined };
        }
        return { ...m, status: 'failed' as const, error: result.error };
    });
}

export function markSending(memos: VoiceMemo[], id: string): VoiceMemo[] {
    return memos.map(m => (m.id === id ? { ...m, status: 'sending' as const, error: undefined } : m));
}

/** リロードを跨いで「文字起こし中」のまま残ったメモに付ける説明。
 *  音声はメモリ上にしか無いため、再送はできない旨を分かりやすく伝える */
export const STALE_SENDING_MESSAGE =
    '読み込み直したため、この文字起こしの結果は確認できませんでした（音声は保存していないため再送できません）。記録したスタッツをご確認ください';

/**
 * sending のまま保存されたメモを failed へ落とす。
 *
 * sessionStorage は「文字起こし中」の状態ごと保存するが、応答を待っている
 * 送信処理そのもの（Promiseや音声Blob）はメモリ上にしかなく、リロードすると
 * 消える。何もしないと該当行は永久に「文字起こし中…」のまま応答が来ず、
 * 記録者が待ち続けてしまうため、復元した時点で「もう来ない」と分かる状態にする
 */
export function downgradeStaleSending(memos: VoiceMemo[]): VoiceMemo[] {
    return memos.map(m =>
        m.status === 'sending'
            ? { ...m, status: 'failed' as const, error: STALE_SENDING_MESSAGE }
            : m,
    );
}

export function removeMemo(memos: VoiceMemo[], id: string): VoiceMemo[] {
    return memos.filter(m => m.id !== id);
}
