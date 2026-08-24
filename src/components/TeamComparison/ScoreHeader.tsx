// 比較画面の見出し。スコアとクォーター別得点表を出す。
//
// チーム名の下の色帯は凡例を兼ねる。以降のバー・ドーナツ・折れ線が
// すべてこの色で描かれるので、どちらの数字かをここで一度示せば足りる。

import { quarterLabel } from '../../utils/quarterLabel';
import type { QuarterScore } from './quarterScores';
import './TeamComparison.css';

interface ScoreHeaderProps {
    leftName: string;
    leftColor: string;
    rightName: string;
    rightColor: string;
    quarterScores: QuarterScore[];
    /** 日付・大会名・会場を1行にまとめたもの */
    caption: string;
}

export function ScoreHeader({
    leftName, leftColor,
    rightName, rightColor,
    quarterScores, caption,
}: ScoreHeaderProps) {
    const leftTotal = quarterScores.reduce((n, r) => n + r.teamA, 0);
    const rightTotal = quarterScores.reduce((n, r) => n + r.teamB, 0);

    return (
        <div className="comparison-score-header">
            {caption && <p className="comparison-caption">{caption}</p>}

            <div className="comparison-scoreline">
                <div className="comparison-team left">
                    <span className="comparison-team-name">{leftName}</span>
                    <span className="comparison-team-bar" style={{ backgroundColor: leftColor }} />
                </div>
                <span className="comparison-score left">{leftTotal}</span>
                <span className="comparison-score-dash">-</span>
                <span className="comparison-score right">{rightTotal}</span>
                <div className="comparison-team right">
                    <span className="comparison-team-name">{rightName}</span>
                    <span className="comparison-team-bar" style={{ backgroundColor: rightColor }} />
                </div>
            </div>

            <table className="quarter-score-table">
                <thead>
                    <tr>
                        <th />
                        {quarterScores.map(row => <th key={row.quarter}>{quarterLabel(row.quarter)}</th>)}
                        <th>T</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <th scope="row">{leftName}</th>
                        {quarterScores.map(row => <td key={row.quarter}>{row.teamA}</td>)}
                        <td className="quarter-score-total">{leftTotal}</td>
                    </tr>
                    <tr>
                        <th scope="row">{rightName}</th>
                        {quarterScores.map(row => <td key={row.quarter}>{row.teamB}</td>)}
                        <td className="quarter-score-total">{rightTotal}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
