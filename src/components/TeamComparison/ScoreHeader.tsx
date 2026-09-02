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
    /**
     * 最終スコア（選手スタッツの合計）。
     *
     * クォーター別の合算では出さない。ピリオド別は得点履歴からしか作れないが、
     * 履歴を欠くレコードが実在する（手で編集した／途中で切れたバックアップの
     * 取り込み）。そのとき合算は 0 になり、すぐ下の PTS 行・履歴一覧・
     * 公式様式のスコア欄（どれも選手スタッツの合計）と食い違う。
     * 実測: 69-47 の試合の見出しだけが 0-0。
     *
     * 同じ事故は finalScore を欠くレコードで既に踏んでいて、読み側は
     * resolveFinalScore で選手スタッツから組み直すことにした
     * （gameHistoryStorage）。ここもその系統に合わせる。
     *
     * ピリオド別のマスは履歴のまま 0 が並ぶ。そこは本当に復元できないので、
     * 埋めずに空けておく——公式様式の側も同じ出方をする（RunningScoresheet）。
     */
    leftTotal: number;
    rightTotal: number;
    /** 日付・大会名・会場を1行にまとめたもの */
    caption: string;
}

export function ScoreHeader({
    leftName, leftColor,
    rightName, rightColor,
    quarterScores, leftTotal, rightTotal, caption,
}: ScoreHeaderProps) {

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
