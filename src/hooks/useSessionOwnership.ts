// 試合系画面にいるあいだ、「このタブが記録中」の印を打ち続ける。
//
// useGameAutoSave と同じ条件で回す。あちらが書く相手（セッション）を、
// こちらが守る。状態が変わらなくても打ち続けるのが要点で、タイムアウトや
// ハーフタイムの数分間に印が古くなると、その隙に別のタブが入れてしまう。

import { useEffect } from 'react';
import type { Game } from '../types/game';
import { HEARTBEAT_MS, claimSessionOwner, releaseSessionOwner } from '../utils/sessionOwner';
import { isGameScreen } from '../types/screens';

export function useSessionOwnership(screen: string, phase: Game['phase']): void {
    const active = isGameScreen(screen) && phase !== 'setup';
    useEffect(() => {
        if (!active) return;
        claimSessionOwner();
        const timer = window.setInterval(claimSessionOwner, HEARTBEAT_MS);
        return () => {
            clearInterval(timer);
            // 試合画面から離れたら手放す。放っておいても時間切れで解けるが、
            // 30秒待たせる理由が無い
            releaseSessionOwner();
        };
    }, [active]);
}
