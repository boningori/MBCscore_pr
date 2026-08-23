// チーム色を「実際の色値」に解決する。
//
// 折れ線とドーナツは出力時に単体へ切り出されて描かれる（html2canvas はSVGを
// 別画像として、conic-gradient はPNGとして描き直す）。そのときページのCSSは
// 効かないので、var(--team-blue) のまま渡すと出力画像で色が消える。
// 描画に使う色は、ここで実値にしてから渡すこと。
//
// 既定値は index.css の --team-white / --team-blue と同じ値。実行時は
// CSS側を正とし、読めない環境（テストのjsdom）でだけこちらへ落ちる。

import type { Team } from '../../types/game';

export const TEAM_COLOR_FALLBACK: Record<Team['color'], string> = {
    white: '#e2e8f0',
    blue: '#3b82f6',
};

const CSS_VARIABLE: Record<Team['color'], string> = {
    white: '--team-white',
    blue: '--team-blue',
};

export function resolveTeamColor(color: Team['color'], element?: Element | null): string {
    const target = element ?? (typeof document === 'undefined' ? null : document.documentElement);
    if (!target) return TEAM_COLOR_FALLBACK[color];

    const value = getComputedStyle(target).getPropertyValue(CSS_VARIABLE[color]).trim();
    return value || TEAM_COLOR_FALLBACK[color];
}
