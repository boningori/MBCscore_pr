import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SIMPLE_MODE_MEDIA_QUERY } from './appSettings';

// シンプルモードの判定条件は CSS と JS の2箇所に同じ値で存在する。
// 片方だけ書き換えると「フルモードなのに窮屈な2カラム」「横向きで
// ボタンが列内スクロールに埋もれる」といった、旧実装で実際に起きていた
// 中途半端な状態が静かに再発する。
// JS側の境界は appSettings.test.ts が守っているが、CSS側の値が動いたことは
// 検知できないため、ここで App.css の @media と一致することを確認する。
// jsdom環境では import.meta.url が file: にならないため、cwd（プロジェクトルート）基準で読む
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf-8');

/** '(max-width: 800px), (a) and (b)' → ['(max-width: 800px)', '(a) and (b)'] */
function splitClauses(query: string): string[] {
    return query.split(',').map(clause => clause.trim()).filter(Boolean);
}

/** 比較用に空白のゆれを吸収する */
function normalize(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

describe('SIMPLE_MODE_MEDIA_QUERY と App.css の @media が一致している', () => {
    const clauses = splitClauses(SIMPLE_MODE_MEDIA_QUERY);

    it('条件が2つ（幅・横向き）に分かれている', () => {
        expect(clauses).toHaveLength(2);
    });

    it.each(clauses)('App.css に @media %s のブロックが存在する', clause => {
        const mediaRules = [...appCss.matchAll(/@media([^{]+)\{/g)]
            .map(m => normalize(m[1]));

        expect(mediaRules).toContain(normalize(clause));
    });
});
