// 更新の案内を出してよい場面かどうか。
//
// 更新はリロードを伴うので、作業の途中では出さずに保留する（検知結果は
// 保持したままなので、ホームへ戻れば出る。useAppUpdate）。
//
// 判定を phase だけで見ていたため、試合設定ウィザードの途中でバナーが出て
// いた。ウィザードは試合を作る前なので phase は 'setup' のまま＝記録中では
// ないと判定される。押すとリロードで入力（試合名・日付・出場選手・対戦相手）が
// まとめて消える。
//
// かといって phase === 'setup' を一律で抑えることはできない。ホーム画面の
// phase も 'setup' なので、更新の案内を出せる場面が無くなってしまう。
// 「どの画面に居るか」と「試合が動いているか」の両方で決める。

import type { Game } from '../../types/game';
import type { AppScreen } from '../../types/screens';
import { isGameScreen } from '../../types/screens';

/** 記録が動いているとみなす phase（画面がどこであっても保留する） */
const ACTIVE_PHASES: readonly Game['phase'][] = ['playing', 'paused', 'quarterEnd'];

/**
 * 未保存の入力を抱える画面。試合は動いていないが、リロードで失うものは同じ。
 *
 * - gameSetup … 試合名・日付・出場選手・対戦相手を入れている途中
 * - myTeamManager / opponentManager … 名簿の編集中。番号・氏名・JBA番号は
 *   「保存」を押すまで書き込まれない。戻る操作には確認を挟んである
 *   （MyTeamManager.tsx / OpponentManager.tsx の useBackHandler）のに、
 *   更新バーからだけ確認なしで消せる状態になっていた
 */
const EDITING_SCREENS: readonly AppScreen[] = ['gameSetup', 'myTeamManager', 'opponentManager'];

/** 更新の案内を出してはいけない場面か */
export function suppressesAppUpdate(screen: AppScreen, phase: Game['phase']): boolean {
    // 記録画面（試合・スタメン選択・様式）
    if (isGameScreen(screen)) return true;
    // 入力の途中。試合はまだ無い／動いていないが、失うものは記録中と同じ
    if (EDITING_SCREENS.includes(screen)) return true;
    // 中断してホームへ戻っているだけの場合も、まだ試合の途中
    return ACTIVE_PHASES.includes(phase);
}
