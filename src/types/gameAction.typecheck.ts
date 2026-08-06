// GameAction ユニオンのコンパイル時テスト。
//
// 拡張子が .test.ts でないのは意図的。tsconfig.app.json は
// "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"] としており、
// テストファイルは tsc -b の対象外になる。ts-expect-error を効かせるには
// 型検査に載る必要があるため、通常のソースとして置く。
// どこからもimportしないのでバンドルには含まれない。
//
// 各 ts-expect-error はエラーが出ないとコンパイル自体が失敗する。つまり
// GameAction のユニオンが緩んだ瞬間に npm run build と CI が落ちる。
//
// 背景: 以前は `{ type: GameActionType; payload?: unknown }` で、37アクション
// すべてのペイロードが無検査だった。reducer側は29箇所でキャストしており、
// App.tsx が quartersPlayed に `true`（QuarterPlayType に無い値）を書いても
// 素通ししていた。

import type { GameAction } from './game';

/** 正しいペイロードは通る */
export const validActions: GameAction[] = [
    { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'p1', scoreType: '2P' } },
    { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'p1', statType: 'OREB' } },
    { type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 6 } },
    { type: 'START_GAME' },
    { type: 'CLEAR_SELECTION' },
];

/** 型として弾かれるべきもの */
export const rejectedActions: GameAction[] = [
    // @ts-expect-error scoreType は '2P' | '3P' | 'FT'
    { type: 'ADD_SCORE', payload: { teamId: 'teamA', playerId: 'p1', scoreType: '4P' } },
    // @ts-expect-error statType は StatType のいずれか
    { type: 'ADD_STAT', payload: { teamId: 'teamA', playerId: 'p1', statType: 'DUNK' } },
    // @ts-expect-error quarterMinutes は 5 | 6
    { type: 'SET_QUARTER_MINUTES', payload: { quarterMinutes: 8 } },
    // @ts-expect-error playerId が欠けている
    { type: 'ADD_SCORE', payload: { teamId: 'teamA', scoreType: '2P' } },
    // @ts-expect-error payload そのものが無い
    { type: 'REMOVE_SCORE' },
    // @ts-expect-error START_GAME は payload を取らない
    { type: 'START_GAME', payload: { foo: 1 } },
    // @ts-expect-error そんなアクションは無い
    { type: 'DELETE_EVERYTHING' },
];
