// シュート成功率の二重リング。外周が左チーム、内周が右チーム。
//
// conic-gradient で塗り、中央を背景色の円で抜いてリングにする。html2canvas は
// conic-gradient を描けないので、割合を data-pie-percent に持たせて出力時に
// PNGへ描き直す（pdfExport.ts の repaintPieCharts）。色も CSS 変数のままでは
// 出力側から読めないため、--pie-main / --pie-rest に実値で載せる。

import type { CSSProperties, ReactNode } from 'react';
import type { TeamTotals } from './teamTotals';
import './TeamComparison.css';

interface ShootingDonutsProps {
    left: TeamTotals;
    right: TeamTotals;
    leftColor: string;
    rightColor: string;
    threePointUnused: boolean;
}

type Shot = '2P' | '3P' | 'FT';

/** 未達分の色。塗り分けの土台になる中立色 */
const REST_COLOR = 'rgba(148, 163, 184, 0.35)';

function madeAttempt(totals: TeamTotals, shot: Shot): [number, number] {
    if (shot === '2P') return [totals.twoMade, totals.twoAttempt];
    if (shot === '3P') return [totals.threeMade, totals.threeAttempt];
    return [totals.ftMade, totals.ftAttempt];
}

function percentOf(totals: TeamTotals, shot: Shot): number {
    const [made, attempt] = madeAttempt(totals, shot);
    return attempt === 0 ? 0 : (made / attempt) * 100;
}

/** 試投0のときは割合を出さない。0.0% と「打っていない」は違う */
function percentText(totals: TeamTotals, shot: Shot): string {
    const [, attempt] = madeAttempt(totals, shot);
    return attempt === 0 ? '-' : `${percentOf(totals, shot).toFixed(1)}%`;
}

function Ring({ position, percent, color, children }: {
    position: 'outer' | 'inner';
    percent: number;
    color: string;
    children?: ReactNode;
}) {
    // カスタムプロパティは CSSProperties の型に無いので、ここで一度だけ通す。
    // --pie-main / --pie-rest は出力時に読む色で、実値でなければ描き直しに使えない
    const style = {
        '--pie-main': color,
        '--pie-rest': REST_COLOR,
        background: `conic-gradient(${color} 0% ${percent}%, ${REST_COLOR} ${percent}% 100%)`,
    } as CSSProperties;

    return (
        <div
            className={`donut-ring ${position}`}
            data-pie-percent={percent}
            style={style}
        >
            {children}
        </div>
    );
}

export function ShootingDonuts({ left, right, leftColor, rightColor, threePointUnused }: ShootingDonutsProps) {
    const shots: Shot[] = ['2P', '3P', 'FT'];

    return (
        <div className="shooting-donuts">
            {shots.map(shot => {
                const unavailable = shot === '3P' && threePointUnused;
                return (
                    <div key={shot} data-shot={shot} className={`shooting-donut ${unavailable ? 'is-unavailable' : ''}`}>
                        {unavailable ? (
                            <div className="donut-ring outer is-empty">
                                <div className="donut-center"><span className="donut-unavailable">未使用</span></div>
                            </div>
                        ) : (
                            <Ring position="outer" percent={Math.round(percentOf(left, shot))} color={leftColor}>
                                <div className="donut-gap">
                                    <Ring position="inner" percent={Math.round(percentOf(right, shot))} color={rightColor}>
                                        <div className="donut-center">
                                            <span className="donut-percent left">{percentText(left, shot)}</span>
                                            <span className="donut-percent right">{percentText(right, shot)}</span>
                                        </div>
                                    </Ring>
                                </div>
                            </Ring>
                        )}
                        <span className="donut-label">{shot}</span>
                    </div>
                );
            })}
        </div>
    );
}
