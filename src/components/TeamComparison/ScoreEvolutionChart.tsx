// 得点推移の折れ線。
//
// 色・線幅は必ず属性に直接書く。CSSクラスで当ててはいけない。html2canvas は
// SVGをページから切り離して画像化するため、ページのCSSで当てたstrokeは
// 出力画像で消える（スコアシートの斜線がこれで消え、座標を測って手描きし直す
// 回避策が入っている。src/utils/pdfExport.ts 参照）。

import { quarterLabel } from '../../utils/quarterLabel';
import type { EvolutionData, EvolutionPoint } from './scoreEvolution';
import './TeamComparison.css';

interface ScoreEvolutionChartProps {
    data: EvolutionData;
    leftColor: string;
    rightColor: string;
}

// viewBox の座標系。実寸は CSS の width で伸縮させる
const WIDTH = 320;
const HEIGHT = 140;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 18;

export function ScoreEvolutionChart({ data, leftColor, rightColor }: ScoreEvolutionChartProps) {
    const lastIndex = Math.max(1, data.points.length - 1);
    const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const x = (index: number) => (index / lastIndex) * WIDTH;
    const y = (score: number) => PADDING_TOP + plotHeight - (score / data.maxScore) * plotHeight;

    const line = (pick: (p: EvolutionPoint) => number) =>
        data.points.map(p => `${x(p.index).toFixed(2)},${y(pick(p)).toFixed(2)}`).join(' ');

    return (
        <div className="score-evolution">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label="得点推移">
                {data.boundaries.map(b => (
                    <g key={`${b.quarter}-${b.index}`}>
                        <line
                            className="quarter-boundary"
                            x1={x(b.index)} y1={PADDING_TOP}
                            x2={x(b.index)} y2={HEIGHT - PADDING_BOTTOM}
                            stroke="#64748b" strokeWidth="1" strokeDasharray="2 3"
                        />
                        <text
                            x={x(b.index)} y={HEIGHT - 4}
                            fill="#94a3b8" fontSize="10" textAnchor="middle"
                        >
                            {quarterLabel(b.quarter)}
                        </text>
                    </g>
                ))}

                {/* SVGは後に書いたものが上に重なる。重なったとき自チーム側が隠れないよう teamA を後に描く */}
                <polyline points={line(p => p.teamB)} fill="none" stroke={rightColor} strokeWidth="2" strokeLinejoin="round" />
                <polyline points={line(p => p.teamA)} fill="none" stroke={leftColor} strokeWidth="2" strokeLinejoin="round" />
            </svg>

            <p className="score-evolution-note">横軸は得点の順番（試合時計ではありません）</p>
        </div>
    );
}
