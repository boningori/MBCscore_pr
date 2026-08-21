// 生成スクリプト（.mjs）の型宣言。
// src/utils/splashScreens.test.ts が対象表を読むためだけに置いている。
// スクリプト側をTSにしないのは、node で直接実行する運用を崩さないため。

export interface SplashTarget {
    /** CSSポイントの幅 */
    w: number;
    /** CSSポイントの高さ */
    h: number;
    /** デバイスピクセル比 */
    dpr: number;
}

export declare const SPLASH_TARGETS: readonly SplashTarget[];
