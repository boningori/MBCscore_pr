// 出力（PDF/JPEG）の失敗のうち、案内を変えなければならないもの。
//
// pdfExport.ts ではなくここに置く理由は2つある。
//  - useExportAction（通知を出す側）が pdfExport の実装を実行時に読み込まずに
//    済む。あちらが読むのは型だけ、というこれまでの関係を保つ
//  - 出力を差し替えてテストする箇所（DetailView / RunningScoresheet）は
//    pdfExport をまるごとモックする。例外の型が同じモジュールにあると、
//    モックが用意し忘れた瞬間に instanceof が壊れ、通知そのものが出なくなる

/**
 * 自前の案内文を持つ出力の失敗。
 *
 * useExportAction の一般的な案内は「他のアプリを閉じてもう一度お試しください」で、
 * これはメモリ不足を想定した文言である。そのとおりにしても直らない相手に
 * 出してはいけないので、理由を知っている側が文面ごと持って投げる。
 * 通知する側はこの型だけを見る（増えるたびに向こうを直さずに済む）。
 */
export class ExportGuidanceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExportGuidanceError';
    }
}

/**
 * 端末の canvas の上限に当たって出力できなかったことを表す例外。
 * 面積の上限は何度やっても直らないので、メモリ不足の案内を出してはいけない。
 */
export class ExportSizeError extends ExportGuidanceError {
    constructor(message: string) {
        super(message);
        this.name = 'ExportSizeError';
    }
}

/**
 * 出力に使うコード（html2canvas / jspdf）を読み込めなかったことを表す例外。
 *
 * この2つは動的importなので、ページを開いた後にチャンクが取れなくなると
 * 出力を押した時点で初めて失敗する。原因はメモリではなく、手元のページと
 * サーバ／キャッシュの版がずれたことなので、打てる手は再読み込みか
 * 通信の回復に限られる（pdfExport.loadExportModule が文面を決める）。
 */
export class ExportModuleError extends ExportGuidanceError {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message);
        this.name = 'ExportModuleError';
        if (options && 'cause' in options) this.cause = options.cause;
    }
}
