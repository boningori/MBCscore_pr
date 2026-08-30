// チームスタッツ比較。試合中の統計画面と履歴の詳細が同じものを使う。
//
// 集計は teamTotals / quarterScores / scoreEvolution が済ませているので、
// ここはクォーターの選択状態を持ち、各部品へ数値を配るだけにする。
//
// バーは画面に入ったタイミングで伸ばす。マウント直後に伸ばすと、
// スクロールして辿り着く頃には動き終わっている。

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FoulEntry, ScoreEntry, StatEntry, Team } from '../../types/game';
import { quarterLabel } from '../../utils/quarterLabel';
import { computeTeamTotals, type QuarterFilter } from './teamTotals';
import { computeQuarterScores, recordedQuarters } from './quarterScores';
import { buildComparisonRows } from './comparisonRows';
import { isThreePointUnused } from './threePointUsage';
import { resolveTeamColor } from './teamColors';
import { buildEvolutionData } from './scoreEvolution';
import { ScoreHeader } from './ScoreHeader';
import { ComparisonTable } from './ComparisonTable';
import { ShootingDonuts } from './ShootingDonuts';
import { ScoreEvolutionChart } from './ScoreEvolutionChart';
import { useExportAction } from '../../hooks/useExportAction';
import { exportElement, sanitizeFilename } from '../../utils/pdfExport';
import './TeamComparison.css';

export interface TeamComparisonProps {
    teamA: Team;
    teamB: Team;
    scoreHistory: ScoreEntry[];
    statHistory: StatEntry[];
    foulHistory: FoulEntry[];
    showThreePoint?: boolean;
    /** 日付・大会名・会場を1行にまとめたもの */
    caption?: string;
    exportable?: boolean;
    exportName?: string;
}

export function TeamComparison({
    teamA, teamB, scoreHistory, statHistory, foulHistory,
    showThreePoint, caption = '', exportable = false, exportName = '',
}: TeamComparisonProps) {
    const [filter, setFilter] = useState<QuarterFilter>('all');
    const [animate, setAnimate] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const { isExporting, runExport } = useExportAction();

    // 拡張子は exportElement 側が format に応じて付ける（他の出力箇所と同じ作法）。
    // ここで付けると二重拡張子になる
    const handleExport = (format: 'jpeg' | 'pdf') => {
        const root = rootRef.current;
        if (!root) return;
        // exportName には試合名（利用者が自由入力）が渡る想定。ファイル名に
        // 使えない文字（/ \ : * ? " < > |）が入りうるのでスコアシート出力と
        // 同じ規則で置き換えてから結合する（sanitizeFilename）
        const filename = exportName ? `${sanitizeFilename(exportName)}_チーム比較` : 'チーム比較';
        void runExport(
            () => exportElement(root, { filename, format }),
            format === 'jpeg' ? 'JPEG' : 'PDF',
        );
    };

    // 画面に入ったら伸ばす。IntersectionObserver が無い環境（jsdom）では
    // すぐ最終幅にする。動かないだけで、数字は同じものが出る
    useEffect(() => {
        const root = rootRef.current;
        if (!root || typeof IntersectionObserver !== 'function') return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setAnimate(true);
                observer.disconnect();
            }
        }, { threshold: 0.1 });

        observer.observe(root);
        return () => observer.disconnect();
    }, []);

    const threePointUnused = useMemo(
        () => isThreePointUnused(showThreePoint, scoreHistory, statHistory),
        [showThreePoint, scoreHistory, statHistory],
    );

    // 引数を省くと :root から読む。初回レンダーでは rootRef がまだ null なので、
    // ここで要素を渡しても意味が無い
    const leftColor = resolveTeamColor(teamA.color);
    const rightColor = resolveTeamColor(teamB.color);

    // 延長は得点履歴だけでは拾えない。0-0のまま次の延長へ進む試合があるため、
    // スタッツ・ファウルの履歴も一緒に見る（quarterScores.recordedQuarters）
    const quarterScores = useMemo(
        () => computeQuarterScores(scoreHistory, statHistory, foulHistory),
        [scoreHistory, statHistory, foulHistory],
    );
    const quarters = useMemo(
        () => recordedQuarters(scoreHistory, statHistory, foulHistory),
        [scoreHistory, statHistory, foulHistory],
    );

    const totalsA = computeTeamTotals({ team: teamA, teamId: 'teamA', scoreHistory, statHistory, foulHistory }, filter);
    const totalsB = computeTeamTotals({ team: teamB, teamId: 'teamB', scoreHistory, statHistory, foulHistory }, filter);

    const rows = buildComparisonRows(totalsA, totalsB, { threePointUnused });
    const evolution = buildEvolutionData(scoreHistory, filter);

    return (
        <div className="team-comparison" ref={rootRef}>
            <ScoreHeader
                leftName={teamA.name} leftColor={leftColor}
                rightName={teamB.name} rightColor={rightColor}
                quarterScores={quarterScores}
                caption={caption}
            />

            <div className="quarter-filter" role="group" aria-label="表示するクォーター">
                <button
                    type="button"
                    className={filter === 'all' ? 'active' : ''}
                    onClick={() => setFilter('all')}
                >
                    全体
                </button>
                {quarters.map(q => (
                    <button
                        key={q}
                        type="button"
                        className={filter === q ? 'active' : ''}
                        onClick={() => setFilter(q)}
                    >
                        {quarterLabel(q)}
                    </button>
                ))}
            </div>

            <ComparisonTable
                rows={rows}
                leftColor={leftColor}
                rightColor={rightColor}
                animate={animate}
                threePointUnused={threePointUnused}
            />

            <ShootingDonuts
                left={totalsA} right={totalsB}
                leftColor={leftColor} rightColor={rightColor}
                threePointUnused={threePointUnused}
            />

            <ScoreEvolutionChart data={evolution} leftColor={leftColor} rightColor={rightColor} />

            {exportable && (
                <div className="comparison-export no-export">
                    <button type="button" className="btn btn-secondary btn-small" disabled={isExporting} onClick={() => handleExport('jpeg')}>
                        🖼 JPEG
                    </button>
                    <button type="button" className="btn btn-secondary btn-small" disabled={isExporting} onClick={() => handleExport('pdf')}>
                        📄 PDF
                    </button>
                </div>
            )}
        </div>
    );
}
