import { useEffect, useRef } from 'react';
import { MAX_PERSONAL_FOULS } from '../types/game';
import type { Game, Player } from '../types/game';
import { formatPlayerNumber } from '../utils/playerNumber';
import { showToast } from '../components/Toast/toastApi';

/** 通知の判定に必要な部分だけを受け取る */
type FoulOutSource = Pick<Game, 'teamA' | 'teamB'>;

/**
 * 選手が5ファウルに達した瞬間をトーストで知らせる。
 *
 * 退場はスコアラーが審判へ即座に伝えるべき事象なのに、これまで気づく手がかりが
 * カードの色だけで、しかも4個目と同じ見た目だった。ファウル入力フローの警告は
 * 「次にその選手へファウルを入れようとしたとき」にしか出ないため、
 * 記録した瞬間には何も起きていなかった。
 *
 * 出場を止めることはしない。練習試合では相手チームの同意のうえで
 * 退場者が出続ける運用があり、アプリが強制すると記録できなくなる。
 * 伝えるだけにして、判断は記録者に委ねる。
 *
 * 状態の差分で見る。ファウルの入り口が複数あり（通常の入力・保留アクションの解決・
 * ベンチテクニカルの選手割り当て）、呼び出し側それぞれに通知を足すと必ず取りこぼす。
 */
export function useFoulOutNotice(state: FoulOutSource): void {
    // 直前に見た選手ごとのファウル数。「知っている選手が4個以下から5個に増えた」
    // ときだけ通知する。
    //
    // 「初回レンダーだけ無視する」では足りない。アプリは空のチームでマウントし、
    // 中断再開では2手目の RESTORE_GAME で選手が現れるため、初回だけ見送ると
    // 復元を新規到達と誤認して過去の退場を蒸し返す（実機で確認）。
    // 直前に居なかった選手は「今5個目に達した」はずがない、という判定にする。
    const seen = useRef(new Map<string, number>());

    useEffect(() => {
        const previous = seen.current;
        const current = new Map<string, number>();
        const reached: Player[] = [];

        for (const team of [state.teamA, state.teamB]) {
            for (const p of team.players) {
                const count = p.fouls.length;
                current.set(p.id, count);

                const before = previous.get(p.id);
                // 直前に居なかった選手（復元・チーム設定・追加）は対象外
                if (before === undefined) continue;
                if (before < MAX_PERSONAL_FOULS && count >= MAX_PERSONAL_FOULS) reached.push(p);
            }
        }

        // 毎回置き換える。誤記録を取り消して5個未満に戻した選手が、
        // あらためて5個目に達したときは再び知らせたい
        seen.current = current;

        for (const p of reached) {
            showToast(
                `⚠️ #${formatPlayerNumber(p.number)} ${p.courtName || p.name} が5ファウル（退場）です`,
                'error',
            );
        }
    }, [state]);
}
