// 試合セッションの自動保存フック
// 試合系画面(GAME_SCREENS)かつ phase!=='setup' で状態が変化したら、
// 500msデバウンスでセッション保存＋ミラースナップショットを行い、UIブロックを防ぐ。
//
// 対象を 'game' 1画面に絞ると、クォーター終了で quarterLineup へ移った瞬間に
// デバウンス中のタイマーがクリーンアップで消え、END_QUARTER 後の状態が
// どこにも保存されないまま残る（リロードすると前のクォーターに巻き戻る）。
// インターバルは端末を置きやすい＝PWAが落とされやすい時間帯なので、
// 試合系画面はまとめて保存対象にする。

import { useEffect, useRef } from 'react';
import type { Game } from '../types/game';
import { saveGameSession } from '../utils/gameSessionStorage';
import { maybeSnapshot } from '../utils/mirrorBackup';
import { isGameScreen } from '../types/screens';

export function useGameAutoSave(
  state: Game,
  screen: string,
  gameName: string,
  date: string,
  phase: Game['phase'],
): void {
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isGameScreen(screen) && phase !== 'setup') {
      // 既存のタイマーをクリア
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // 500ms後に保存（UIブロックを防止）
      saveTimeoutRef.current = window.setTimeout(() => {
        saveGameSession(state, gameName, date);
        maybeSnapshot();
      }, 500);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, screen, gameName, date, phase]);
}
