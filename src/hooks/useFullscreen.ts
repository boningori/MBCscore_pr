// フルスクリーン制御フック
// ベンダープレフィックス付きのFullscreen APIをブラウザ互換で扱い、
// ESCキー等で解除された場合も含めて表示状態を追従する。

import { useEffect, useState } from 'react';
import { showToast } from '../components/Toast/toastApi';

// ベンダープレフィックス付きフルスクリーンAPI（ブラウザ互換のため）
interface VendorPrefixedDocument extends Document {
  mozFullScreenElement?: Element;
  webkitFullscreenElement?: Element;
  msFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
}

/**
 * この端末・この文脈で全画面表示が使えるか。
 *
 * 使えない場合、toggleFullScreen は分岐をどれも満たさず、例外も出さずに
 * 素通りする——押しても無反応・無通知のボタンになる。iOS / iPadOS の Safari は
 * 任意要素の Fullscreen API を持たないので、このアプリの主対象でそれが起きる。
 * 呼び出し側がボタンを出すかどうか決められるように返す。
 *
 * `*Enabled` は「APIがある」だけでなく「いま許可されている」まで見る。
 * 埋め込み（allow-fullscreen の無い iframe）では API があっても拒否されるので、
 * どちらも出さない側に倒す。
 */
function detectFullscreenSupport(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as VendorPrefixedDocument;
  return Boolean(
    doc.fullscreenEnabled
    || doc.webkitFullscreenEnabled
    || doc.mozFullScreenEnabled
    || doc.msFullscreenEnabled,
  );
}

interface VendorPrefixedElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
}

export interface UseFullscreenResult {
  isFullScreen: boolean;
  /** 全画面が使える端末か。false のとき呼び出し側はボタンを出さないこと */
  isSupported: boolean;
  toggleFullScreen: () => Promise<void>;
}

export function useFullscreen(): UseFullscreenResult {
  const [isFullScreen, setIsFullScreen] = useState(false);
  // 判定は端末の性質で、セッション中に変わらない。マウント時に一度だけ見る
  const [isSupported] = useState(detectFullscreenSupport);

  const toggleFullScreen = async () => {
    try {
      const doc = document as VendorPrefixedDocument;
      const elem = document.documentElement as VendorPrefixedElement;

      const isFs = doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;

      if (!isFs) {
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          await elem.msRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
          await elem.mozRequestFullScreen();
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        }
      }
    } catch (err) {
      console.error('フルスクリーン切り替えエラー:', err);
      showToast('全画面表示に切り替えられませんでした。ブラウザの設定を確認してください', 'error');
    }
  };

  // フルスクリーン状態の監視（ESCキーなどで解除された場合に対応）
  useEffect(() => {
    const handleFullScreenChange = () => {
      const doc = document as VendorPrefixedDocument;
      const isFs = !!(doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
      setIsFullScreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);
    document.addEventListener('MSFullscreenChange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullScreenChange);
    };
  }, []);

  return { isFullScreen, isSupported, toggleFullScreen };
}
