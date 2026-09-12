// FT結果の型のコンパイル時テスト。
//
// 拡張子が .test.ts でないのは意図的（gameAction.typecheck.ts と同じ理由）。
// tsconfig.app.json がテストファイルを tsc -b の対象外にしているため、
// ts-expect-error を効かせるには通常のソースとして置く必要がある。
// どこからもimportしないのでバンドルには含まれない。
//
// 守りたいのは「記録として残る FreeThrowResult に null が入らない」こと。
// FoulInputFlow は入力途中を null で持つが、areFreeThrowsEntered を通った
// ものだけが外へ出る。FreeThrowResult 自体が null を許すように緩められると
// その区別が消えるので、ここで止める。

import type { FreeThrowEntry, FreeThrowResult } from './game';

/** 記録として残る値 */
export const recorded: FreeThrowResult[] = ['made', 'missed'];

/** 入力途中はnullを持てる */
export const entering: FreeThrowEntry[] = ['made', null];

/** 記録として残る型に null は入らない */
export const rejected: FreeThrowResult[] = [
    'made',
    // @ts-expect-error FreeThrowResult は 'made' | 'missed'。null を許してはいけない
    null,
];

/** 入力途中の配列を、そのまま記録の型として扱えてはいけない */
// @ts-expect-error FreeThrowEntry[] から FreeThrowResult[] へは、型ガードを通さないと移れない
export const unchecked: FreeThrowResult[] = entering;
