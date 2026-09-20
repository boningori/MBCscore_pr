// 選手の識別キーの形を決める唯一の場所。
//
// キーは `氏名_ライセンスNo.の下3桁`。作る側（playerStatsAnalysis の
// generatePlayerKey）と、保存済みキーを矯正する側（mergedPlayers の対応表、
// playerStatsAnalysis の非表示選手）が別ファイルにあり、しかも
// mergedPlayers は playerStatsAnalysis を import できない（逆向きの import が
// 既にあり循環する）。そのため、どちらにも依存しないここに形を集める。
//
// 何も import しないこと。ここが他のモジュールに依存すると循環が戻ってくる。

/**
 * 氏名の正規化。空白（半角・全角）だけを取り除く。
 *
 * 公式様式の氏名は均等割付で字間に全角スペースが入り、手入力では姓名の間に
 * 半角・全角スペースが日常的に混ざる。どちらも同じ選手なのでキーが割れてはいけない。
 *
 * 取り除くのは空白だけにとどめる。正規化を強くするほど別人を同じ氏名と
 * 見なす危険が増える（mergedPlayers の normalizeNameForMerge と同じ判断）。
 */
export function normalizePlayerName(name: string): string {
    // 型は string だが、実際に通るのはバックアップの手編集のような
    // 検証を経ていない値もある（dataBackup の sanitizeImportedGame は id しか
    // 見ていない）。数値等がそのまま来て .replace で落ちると、選手スタッツ分析の
    // 集計全体がエラー画面になる——非表示選手ストレージで実測済みなのと同じ
    // 失敗パターン（playerStatsAnalysis.ts 参照）。ここでも安全側に矯正する
    if (typeof name !== 'string') return '';
    // \s は全角スペース(U+3000)も含む。文字クラスに直接書くと lint の
    // no-irregular-whitespace に掛かる
    return name.replace(/\s/g, '');
}

/**
 * ライセンスNo.を識別用に揃える。
 *
 * 同じ選手が2つの桁数で登録される。公式戦のプログラムにはJBA登録番号が
 * 10桁の英数字で載り、それ以外の試合のメンバー表には下3桁だけが載る
 * （RunningScoresheet の注記と同じ欄）。年間では後者が大半。
 *
 * slice(-3) は3文字未満をそのまま返すので、1〜2桁が残っている古い保存データも
 * 壊さない（新規の読み取りでは imageOCR が2桁以下を捨てる）。
 */
function normalizeLicenseForKey(licenseNo: string): string {
    return licenseNo.slice(-3);
}

/**
 * 選手の識別キー（氏名＋ライセンスNo.の下3桁）
 *
 * 氏名・ライセンスNo.とも、まず空白を取り除いてから組み立てる。ここで
 * 空白を残したまま `.trim()` だけで済ませると、内部に空白を含む
 * ライセンスNo.（例: 手入力の「A B1234」）がそのまま英数字判定に渡り、
 * migrateIdentityKey が同じ入力に対して出す形とずれる（後述）。
 */
export function buildPlayerIdentityKey(name: string, licenseNo?: string): string {
    const cleanName = normalizePlayerName(name);
    const license = normalizePlayerName(licenseNo ?? '');
    if (!license) return cleanName;
    return `${cleanName}_${normalizeLicenseForKey(license)}`;
}

/**
 * 保存済みのキーを、今の形へ合わせ直す。
 *
 * 以前のキーは `氏名（空白そのまま）_ライセンスNo.そのもの` だった。
 * 直さずに読むと、利用者が手で行った統合や非表示が黙って効かなくなる。
 *
 * 区切りの `_` は最後のものを見る。ただし末尾が半角英数字でなければ、
 * それは区切りではなく氏名の一部である（ライセンスNo.は保存前に英数字だけへ
 * 均されている）。この判定が無いと `鈴木_一郎` が `鈴木_郎` に切り詰められる。
 *
 * 空白は最初に、キー全体に対して一度だけ取り除く。英数字判定と、判定が
 * 落ちたときの氏名フォールバックが「同じ文字列」を見ていないと、
 * 一方が弾いた空白入り候補を他方が空白を落としてから通してしまい、
 * 2回目に通したときだけ結果が変わる（冪等が崩れる）。判定の対象と
 * フォールバックの対象を最初から一致させることで、これを防ぐ。
 *
 * 何度通しても結果が変わらないこと（冪等）が要件。読み込みのたびに掛かる。
 */
export function migrateIdentityKey(key: string): string {
    const cleaned = normalizePlayerName(key);
    const separator = cleaned.lastIndexOf('_');
    const license = separator > 0 ? cleaned.slice(separator + 1) : '';
    if (!license || !/^[a-zA-Z0-9]+$/.test(license)) return cleaned;
    return `${cleaned.slice(0, separator)}_${normalizeLicenseForKey(license)}`;
}
