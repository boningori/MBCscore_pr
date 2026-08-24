import { describe, it, expect } from 'vitest';
import { resolveTeamColor, TEAM_COLOR_FALLBACK } from './teamColors';

describe('resolveTeamColor', () => {
    it('CSS変数が読めない環境では既定値を返す', () => {
        expect(resolveTeamColor('blue')).toBe(TEAM_COLOR_FALLBACK.blue);
        expect(resolveTeamColor('white')).toBe(TEAM_COLOR_FALLBACK.white);
    });

    it('var() をそのまま返さない', () => {
        expect(resolveTeamColor('blue')).not.toContain('var(');
    });

    it('CSS変数が読めればその値を返す', () => {
        const el = document.createElement('div');
        el.style.setProperty('--team-blue', '#123456');
        document.body.appendChild(el);

        expect(resolveTeamColor('blue', el)).toBe('#123456');

        el.remove();
    });
});
