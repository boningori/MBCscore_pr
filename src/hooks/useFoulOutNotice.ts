import { useEffect, useRef } from 'react';
import type { Game, Player } from '../types/game';
import { formatPlayerNumber } from '../utils/playerNumber';
import {
    getDisqualification,
    disqualificationMessage,
    type DisqualificationReason,
} from '../utils/disqualification';
import { showToast } from '../components/Toast/toastApi';

/** 通知の判定に必要な部分だけを受け取る */
type FoulOutSource = Pick<Game, 'teamA' | 'teamB'>;

/**
 * 選手が退場・失格に達した瞬間をトーストで知らせる。
 *
 * 退場はスコアラーが審判へ即座に伝えるべき事象なのに、これまで気づく手がかりが
 * カードの色だけで、しかも4個目と同じ見た目だった。ファウル入力フローの警告は
 * 「次にその選手へファウルを入れようとしたとき」にしか出ないため、
 * 記録した瞬間には何も起きていなかった。
 *
 * 判定は5ファウルだけでなく D / U・T 2回も含む（詳細は disqualification.ts）。
 * これらは5個目より先に来るため、ファウル数だけを見ていると鳴らなかった。
 *
 * 出場を止めることはしない。練習試合では相手チームの同意のうえで
 * 退場者が出続ける運用があり、アプリが強制すると記録できなくなる。
 * 伝えるだけにして、判断は記録者に委ねる。
 *
 * 状態の差分で見る。ファウルの入り口が複数あり（通常の入力・保留アクションの解決・
 * ベンチテクニカルの選手割り当て）、呼び出し側それぞれに通知を足すと必ず取りこぼす。
 */
export function useFoulOutNotice(state: FoulOutSource): void {
    // 直前に見た選手ごとの退場理由（未達なら null）。
    // 「知っている選手が未達から退場に変わった」ときだけ通知する。
    //
    // 「初回レンダーだけ無視する」では足りない。アプリは空のチームでマウントし、
    // 中断再開では2手目の RESTORE_GAME で選手が現れるため、初回だけ見送ると
    // 復元を新規到達と誤認して過去の退場を蒸し返す（実機で確認）。
    // 直前に居なかった選手は「今到達した」はずがない、という判定にする。
    const seen = useRef(new Map<string, DisqualificationReason | null>());

    useEffect(() => {
        const previous = seen.current;
        const current = new Map<string, DisqualificationReason | null>();
        const reached: { player: Player; reason: DisqualificationReason }[] = [];

        for (const team of [state.teamA, state.teamB]) {
            for (const p of team.players) {
                const reason = getDisqualification(p.fouls);
                current.set(p.id, reason);

                // 直前に居なかった選手（復元・チーム設定・追加）は対象外
                if (!previous.has(p.id)) continue;
                // 理由が変わったときも知らせる（5ファウル → Dで失格 など）
                if (reason !== null && previous.get(p.id) !== reason) {
                    reached.push({ player: p, reason });
                }
            }
        }

        // 毎回置き換える。誤記録を取り消して未達に戻した選手が、
        // あらためて到達したときは再び知らせたい
        seen.current = current;

        for (const { player, reason } of reached) {
            showToast(
                `⚠️ #${formatPlayerNumber(player.number)} ${player.courtName || player.name} が${disqualificationMessage(reason)}`,
                'error',
            );
        }
    }, [state]);
}
