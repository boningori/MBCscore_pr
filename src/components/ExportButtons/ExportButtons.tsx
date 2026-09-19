// 画像・PDF出力のボタン2つと、出力中を知らせる領域。
//
// 同じボタンがスタッツ表・スコアシート・選手詳細・チーム比較の4箇所に要る。
// 以前は3箇所それぞれに書いてあり、ラベル（「PDF出力」と「📄 PDF」）、
// 並び順、ボタンの階層、「出力中…」の有無がばらばらになっていた。
// 見た目と読み上げ名をここ1箇所に持たせる。
//
// ラッパのdivを作らず断片で返すのは、置かれる先のツールバーに出力以外の
// ものが同居しているため（スコアシートの「試合情報編集」「閉じる」、
// 選手詳細の表示トグル）。それぞれ狭い画面向けの折り返し調整を持っており、
// 間に1枚挟むとflexの計算が変わる。中のボタンだけ差し替える。

import './ExportButtons.css';

export interface ExportButtonsProps {
    /** 出力の実行中か（useElementExport が返すもの） */
    isExporting: boolean;
    onExportPdf: () => void;
    onExportJpeg: () => void;
}

export function ExportButtons({ isExporting, onExportPdf, onExportJpeg }: ExportButtonsProps) {
    return (
        <>
            <button
                type="button"
                className="btn btn-primary"
                onClick={onExportPdf}
                disabled={isExporting}
            >
                PDF出力
            </button>
            <button
                type="button"
                className="btn btn-secondary"
                onClick={onExportJpeg}
                disabled={isExporting}
            >
                JPEG出力
            </button>
            {/*
              出力は端末によっては十数秒かかる。ボタンのラベルを「出力中…」に
              差し替えると読み上げ名（PDF出力/JPEG出力）が変わってしまうため、
              知らせるのは別領域の役目にする
            */}
            <span className="export-status" role="status">
                {isExporting ? '出力中… そのままお待ちください' : ''}
            </span>
        </>
    );
}
