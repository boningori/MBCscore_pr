// 比較表。値の決定は comparisonRows.ts が済ませているので、ここは描くだけにする。
//
// バーの色は CSS 変数ではなく実値を prop で受け取る。出力時に色が消えるのを
// 避けるためで、理由は teamColors.ts のコメントに書いてある。

import type { ComparisonRow } from './comparisonRows';
import './TeamComparison.css';

interface ComparisonTableProps {
    rows: ComparisonRow[];
    /** 左チームの色（実値。var() は不可） */
    leftColor: string;
    rightColor: string;
    /** 幅0から伸ばすか。画面に入ったタイミングで true にする */
    animate: boolean;
    threePointUnused: boolean;
}

/** 勝敗が付いている行で、負けている側を淡くする */
const PALE_OPACITY = 0.45;

function Bar({ side, ratio, fill, color, leader }: {
    side: 'left' | 'right';
    ratio: number;
    /** バーのうち塗りつぶす割合。シュートの実数行だけ1未満（長さ＝試投、塗り＝成功） */
    fill: number;
    color: string;
    leader: 'left' | 'right' | 'none';
}) {
    // 長さ0のバーは描かない。枠を持つようになったため、幅0でも枠のぶん
    // 4pxのピンクの点が残り、描画の壊れに見えてしまう（TO・ファウルは
    // 少ない方が勝ちなので、0が勝っている側になることが実際にある）
    if (ratio === 0) return null;

    const isLeader = leader === side;
    // 勝敗を出さない行（シュートの実数行、試投が少ない割合の行）は両側とも
    // 淡くしない。「引き分け」ではなく「判定していない」ので、負けたように
    // 見せてはいけない
    const paled = leader !== 'none' && !isLeader;

    return (
        <div
            className={`comparison-bar ${side} ${isLeader ? 'is-leader' : ''}`}
            style={{ width: `${ratio * 100}%`, opacity: paled ? PALE_OPACITY : 1 }}
        >
            {/* 試投のぶん（薄い面）と成功のぶん（濃い面）を重ねる。実数以外の
                行は fill が1なので、従来どおり全体が塗られて見える */}
            <span className="comparison-bar-track" style={{ backgroundColor: color }} />
            <span className="comparison-bar-made" style={{ backgroundColor: color, width: `${fill * 100}%` }} />
        </div>
    );
}

export function ComparisonTable({ rows, leftColor, rightColor, animate, threePointUnused }: ComparisonTableProps) {
    return (
        <div className={`comparison-table ${animate ? 'is-animating' : ''}`}>
            {rows.map(row => (
                <div
                    key={row.key}
                    data-row-key={row.key}
                    className={`comparison-row ${row.unavailable ? 'is-unavailable' : ''}`}
                >
                    <span className="comparison-value left">{row.leftText}</span>
                    <div className="comparison-bar-area left">
                        {!row.unavailable && (
                            <Bar side="left" ratio={row.leftRatio} fill={row.leftFill} color={leftColor} leader={row.leader} />
                        )}
                    </div>
                    <span className="comparison-label">
                        {row.label}
                        {/* この行だけ少ない方が良い。他の行と逆の読み方を求めるので
                            画面上でも示す（矢印だけでは伝わらないので読み上げ用の名前を付ける） */}
                        {row.lowerIsBetter && (
                            <span className="lower-is-better" role="img" aria-label="少ない方が良い" title="少ない方が良い">↓</span>
                        )}
                    </span>
                    <div className="comparison-bar-area right">
                        {!row.unavailable && (
                            <Bar side="right" ratio={row.rightRatio} fill={row.rightFill} color={rightColor} leader={row.leader} />
                        )}
                    </div>
                    <span className="comparison-value right">{row.rightText}</span>
                </div>
            ))}

            {threePointUnused && (
                <p className="comparison-note">この試合は3Pを使用していません</p>
            )}
        </div>
    );
}
