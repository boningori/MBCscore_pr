// 出力（PDF/JPEG）の失敗のうち、案内を変えなければならないもの。
//
// pdfExport.ts ではなくここに置く理由は2つある。
//  - useExportAction（通知を出す側）が pdfExport の実装を実行時に読み込まずに
//    済む。あちらが読むのは型だけ、というこれまでの関係を保つ
//  - 出力を差し替えてテストする箇所（DetailView / RunningScoresheet）は
//    pdfExport をまるごとモックする。例外の型が同じモジュールにあると、
//    モックが用意し忘れた瞬間に instanceof が壊れ、通知そのものが出なくなる

/**
 * 端末の canvas の上限に当たって出力できなかったことを表す例外。
 *
 * 呼び出し側（useExportAction）の一般的な案内は「他のアプリを閉じて
 * もう一度お試しください」で、これはメモリ不足を想定した文言である。
 * 面積の上限は何度やっても直らないので、その案内を出してはいけない。
 * 理由はこの例外が持っているので、そのまま画面へ出す。
 */
export class ExportSizeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExportSizeError';
    }
}
