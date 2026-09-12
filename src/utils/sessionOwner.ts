// 記録中のタブを表す印。
//
// 同じ端末の2つのタブで同じ試合を記録すると、あとから書いたほうが勝ち、もう
// 片方の記録が黙って消える。useGameAutoSave はメモリ上の状態を丸ごと書くので、
// 相手の得点を知らないまま自分の版で上書きしてしまう（実測: 3本入れて2本しか
// 残らない）。両方のタブが同じ数字を表示し、スコアシートの辻褄も合うため、
// 足りないことに気づく手がかりが無い。
//
// 起きてから警告するのでは遅い。後から開いたタブを入口で止める。

/** 記録中のタブを表す印の置き場 */
const OWNER_KEY = 'minibasket-session-owner';

/**
 * 心拍の間隔。
 *
 * 自動保存は状態が変わったときにしか走らない。タイムアウトやハーフタイムで
 * 数分タップが無いと印が古くなり、その隙に別のタブが入れてしまう。だから
 * 状態と無関係に一定間隔で打つ。
 */
export const HEARTBEAT_MS = 5_000;

/**
 * これを過ぎた印は「もう誰も使っていない」とみなす。
 *
 * 心拍の6回ぶん。短すぎると静かな時間に所有権を落とし、長すぎると端末が
 * 落ちたあとの復帰が遅れる。
 */
export const OWNER_STALE_MS = 30_000;

/** 塞いだときに出す文言。呼び出し側とテストで同じものを使う */
export const OTHER_TAB_MESSAGE = '別のタブでこの試合を記録中です。そちらのタブで続けてください。';

interface Owner {
    id: string;
    at: number;
}

let tabId: string | null = null;

/** このタブのid（読み込みごとに1つ） */
export function myTabId(): string {
    tabId ??= crypto.randomUUID();
    return tabId;
}

function readOwner(): Owner | null {
    try {
        const raw = localStorage.getItem(OWNER_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const owner = parsed as Owner;
        if (typeof owner.id !== 'string' || typeof owner.at !== 'number') return null;
        return owner;
    } catch (error) {
        // 読めない印は「誰も使っていない」として扱う。ここで塞ぐ側へ倒すと、
        // 壊れた値ひとつで試合を始められない端末ができる
        console.warn('Discarded malformed session owner in localStorage:', error);
        return null;
    }
}

/** 自分が使っていると宣言する（心拍） */
export function claimSessionOwner(): void {
    try {
        localStorage.setItem(OWNER_KEY, JSON.stringify({ id: myTabId(), at: Date.now() }));
    } catch {
        // 書けなくても記録そのものは続く。所有権は「守れたら守る」程度の
        // 仕組みで、ここで止めるほうが害が大きい
    }
}

/** 自分が持っているなら手放す */
export function releaseSessionOwner(): void {
    const owner = readOwner();
    if (owner?.id !== myTabId()) return;
    try {
        localStorage.removeItem(OWNER_KEY);
    } catch {
        // 消せなくても時間切れで自然に解ける
    }
}

/** 別のタブが、いま記録中か */
export function isOwnedByOtherTab(): boolean {
    const owner = readOwner();
    if (!owner) return false;
    if (owner.id === myTabId()) return false;
    return Date.now() - owner.at <= OWNER_STALE_MS;
}
