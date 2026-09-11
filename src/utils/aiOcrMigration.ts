// AI写真読込を独立したスイッチにしたときの、既存利用者の引き継ぎ。
//
// これまでAI経路（Gemini）を使うかどうかは「APIキーがあるかどうか」だけで
// 決まっていた。キーは音声メモと共用なので、その形のままでは
// 「音声メモのためにキーを入れたら、名簿の写真まで黙ってGoogleへ送られる」
// という状態を作ってしまう。そこで設定を分けた（appSettings の aiOcrEnabled）。
//
// ただし、この版より前からキーを入れていた利用者は、その入力欄のすぐ横にある
// 説明——撮影した画像がGoogleへ送られる——を読んだうえでAI経路を使っている。
// 更新の瞬間に黙って標準OCRへ落とすのは、頼まれた機能を取り上げることになる。
//
// 起動時に一度だけ、いまの状態を設定へ焼き付ける。savedTeamIdMigration が
// 「改名される前に今日の帰属をidへ凍結する」のと同じ考え方で、意味が変わる前に
// 今の意味を書き留める。
//
// 一度書けば hasStoredAiOcr() が真になり、以後この関数は何もしない。
// だから起動のたびに呼んでよく、自分でOFFにした人の意思を上書きしない。

import { getStoredApiKey } from './geminiClient';
import { hasStoredAiOcr, saveAppSettings } from './appSettings';

export function migrateAiOcrSetting(): void {
    // すでに自分で選んでいる（ON/OFFどちらでも）なら触らない
    if (hasStoredAiOcr()) return;
    // キーが無い＝AI経路を使っていなかった。未選択のまま残し、
    // 新規利用者にはスイッチで選んでもらう
    if (!getStoredApiKey()) return;

    // 同意も与えたものとして扱う。同意ダイアログは「これから送り始める」ための
    // 確認であって、すでに送っていた利用者に出すと、使えていた機能が一度
    // 止まったように見える
    saveAppSettings({ aiOcrEnabled: true, aiOcrConsented: true });
}
