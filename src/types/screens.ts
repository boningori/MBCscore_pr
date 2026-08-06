// 画面の識別子。App.tsx の画面切り替えと、画面に依存するフックが共有する。
// （App.tsx に置くと、App が読み込むフック側から参照できないため独立させている）

export type AppScreen =
    | 'home'
    | 'myTeamManager'
    | 'opponentManager'
    | 'gameSetup'
    | 'game'
    | 'quarterLineup'
    | 'history'
    | 'scoresheet'
    | 'playerStats';

// 試合が進行中の画面。次の2つが同じ集合を見る必要がある。
//   - 戻る/進むでの復元ガード（useScreenHistorySync）
//   - 中断セッションの自動保存（useGameAutoSave）
// 試合系画面を追加したらここに追加すること。
// 特に自動保存は、ここに無い画面へ遷移した瞬間に保存が止まるため、
// クォーター終了（game → quarterLineup）のような遷移直後の状態が
// 保存されないまま取り残される。
export const GAME_SCREENS: readonly AppScreen[] = ['game', 'quarterLineup', 'scoresheet'];

/** 試合の進行中とみなす画面か */
export function isGameScreen(screen: string): boolean {
    return (GAME_SCREENS as readonly string[]).includes(screen);
}
