// ゲームモード（フル/シンプル）の状態管理フック。
//
// 端末の回転やウィンドウリサイズでCSSのレイアウト段階が変わったら、モードもそれに追従する。
// 旧実装は起動時に一度だけ画面幅を見ていたため、iPadを縦横に回してもモードが変わらず、
// 「フルモードのまま2カラムに畳まれてスクロールしないと得点ボタンが押せない」状態になっていた。
//
// ただしユーザーが自分で切り替えた後、および設定画面で既定モードを保存済みの場合は追従しない。
// 試合中に画面が勝手に組み替わる方が実害が大きいため、明示的な意思を常に優先する。

import { useCallback, useEffect, useState } from 'react';
import type { GameMode } from '../utils/appSettings';
import {
  SIMPLE_MODE_MEDIA_QUERY,
  getDefaultGameMode,
  getViewportGameMode,
  hasStoredGameMode,
} from '../utils/appSettings';

export interface UseGameModeResult {
  gameMode: GameMode;
  toggleGameMode: () => void;
}

export function useGameMode(): UseGameModeResult {
  const [gameMode, setGameMode] = useState<GameMode>(getDefaultGameMode);
  // ヘッダーのボタンで手動切り替えしたか（この操作以降は画面幅に追従しない）
  const [isManualOverride, setIsManualOverride] = useState(false);

  const toggleGameMode = useCallback(() => {
    setIsManualOverride(true);
    setGameMode(prev => (prev === 'full' ? 'simple' : 'full'));
  }, []);

  useEffect(() => {
    if (isManualOverride) return;
    if (typeof window.matchMedia !== 'function') return;

    const mql = window.matchMedia(SIMPLE_MODE_MEDIA_QUERY);
    const sync = () => {
      // 設定画面で既定モードが保存された場合は、この場で追従を止める
      // （設定モーダルは現在のモードを変更しないため、保存の有無をここで見る）
      if (hasStoredGameMode()) return;
      setGameMode(getViewportGameMode());
    };

    // 購読開始までに幅が変わっていた場合に備えて一度合わせる
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [isManualOverride]);

  return { gameMode, toggleGameMode };
}
