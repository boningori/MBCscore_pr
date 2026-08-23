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

/** 劣勢側は淡くする。同値のときは両方この扱いになる */
const PALE_OPACITY = 0.45;

function Bar({ side, ratio, color, isLeader }: {
    side: 'left' | 'right';
    ratio: number;
    color: string;
    isLeader: boolean;
}) {
    return (
        <div
            className={`comparison-bar ${side} ${isLeader ? 'is-leader' : ''}`}
            style={{
                width: `${ratio * 100}%`,
                backgroundColor: color,
                opacity: isLeader ? 1 : PALE_OPACITY,
            }}
        />
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
                            <Bar side="left" ratio={row.leftRatio} color={leftColor} isLeader={row.leader === 'left'} />
                        )}
                    </div>
                    <span className="comparison-label">{row.label}</span>
                    <div className="comparison-bar-area right">
                        {!row.unavailable && (
                            <Bar side="right" ratio={row.rightRatio} color={rightColor} isLeader={row.leader === 'right'} />
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
