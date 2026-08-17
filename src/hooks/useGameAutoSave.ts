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
  // デバウンス待ちの書き込み内容。試合系画面から離れた瞬間に取りこぼさないため、
  // 「まだ書けていないもの」をここに置いておく
  const pendingSaveRef = useRef<{ state: Game; gameName: string; date: string } | null>(null);
  // 離脱時に書き出す値。リスナーの中から「その瞬間の最新」を読みたいが、
  // 依存配列に入れて貼り替えると記録のたびに add/remove を繰り返すため ref で渡す
  const latestRef = useRef({ state, screen, gameName, date, phase });
  useEffect(() => {
    latestRef.current = { state, screen, gameName, date, phase };
  });

  useEffect(() => {
    if (isGameScreen(screen) && phase !== 'setup') {
      // 既存のタイマーをクリア
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      pendingSaveRef.current = { state, gameName, date };
      // 500ms後に保存（UIブロックを防止）
      saveTimeoutRef.current = window.setTimeout(() => {
        saveGameSession(state, gameName, date);
        pendingSaveRef.current = null;
        maybeSnapshot();
      }, 500);
      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }

    // 試合系画面から離れた。クリーンアップがタイマーを消すだけだと、
    // 直前500ms以内の記録がセッションに残らない（記録した直後にホームへ
    // 抜けて「試合を再開」すると、その1点が消える）。ここで書き切る。
    //
    // ただし終了済みの試合では書かない。「保存して終了」も「保存せずにホームへ」も
    // clearGameSession のあとにホームへ移るので、ここで書き戻すと終わったはずの
    // 試合が「再開できる中断試合」として蘇る。ホームへ抜ける導線のうち
    // セッションを消すのはこの2つだけで、どちらも phase === 'finished' から来る
    if (pendingSaveRef.current && phase !== 'finished') {
      const pending = pendingSaveRef.current;
      saveGameSession(pending.state, pending.gameName, pending.date);
      maybeSnapshot();
    }
    pendingSaveRef.current = null;
  }, [state, screen, gameName, date, phase]);

  // 画面が隠れたら、デバウンスを待たずにその場で書き出す。
  // PWAはバックグラウンドに回った時点でOSに凍結・破棄されうるため、
  // 500msの待ちに入ったまま落とされると直前の得点やファウルが残らない。
  useEffect(() => {
    const flush = () => {
      const current = latestRef.current;
      if (!isGameScreen(current.screen) || current.phase === 'setup') return;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      pendingSaveRef.current = null;
      saveGameSession(current.state, current.gameName, current.date);
      maybeSnapshot();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // iOSでは visibilitychange が来ないまま破棄されることがあるため pagehide も見る
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
}
