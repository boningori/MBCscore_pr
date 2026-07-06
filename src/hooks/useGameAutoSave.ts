// 試合セッションの自動保存フック
// 試合中(screen==='game' かつ phase!=='setup')に状態が変化したら、
// 500msデバウンスでセッション保存＋ミラースナップショットを行い、UIブロックを防ぐ。

import { useEffect, useRef } from 'react';
import type { Game } from '../types/game';
import { saveGameSession } from '../utils/gameSessionStorage';
import { maybeSnapshot } from '../utils/mirrorBackup';

export function useGameAutoSave(
  state: Game,
  screen: string,
  gameName: string,
  date: string,
  phase: Game['phase'],
): void {
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (screen === 'game' && phase !== 'setup') {
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
