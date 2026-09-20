// Geminiの応答形式は1つに固定できない。
//   - responseSchema を付けた応答は {"teams":[...]}
//   - 旧プロンプト・スキーマ非対応モデルは素の配列 [...]
//   - モデルによっては ```json のフェンスで包む
// どれで来ても同じ RawTeam[] に均す。ここを外すと、後続の検証が
// 「選手0人」と判断して黙って Tesseract へ落ちる

import { describe, it, expect } from 'vitest';
import { parseGeminiRosterResponse } from './geminiRosterResponse';

describe('parseGeminiRosterResponse', () => {
    it('teams形式をそのまま読む', () => {
        const teams = parseGeminiRosterResponse(
            '{"teams":[{"teamName":"A小","players":[{"number":4,"name":"田中"}]}]}',
        );
        expect(teams).toHaveLength(1);
        expect(teams[0].teamName).toBe('A小');
        expect(teams[0].players).toEqual([{ number: 4, name: '田中' }]);
    });

    it('複数チームをそのまま返す（判断は呼び出し側）', () => {
        const teams = parseGeminiRosterResponse(
            '{"teams":[{"players":[{"number":4,"name":"甲"}]},{"players":[{"number":5,"name":"乙"}]}]}',
        );
        expect(teams).toHaveLength(2);
    });

    it('素の配列は1チーム分として受ける（後方互換）', () => {
        const teams = parseGeminiRosterResponse('[{"number":4,"name":"田中"}]');
        expect(teams).toEqual([{ players: [{ number: 4, name: '田中' }] }]);
    });

    it('コードフェンスで包まれていても読む', () => {
        const teams = parseGeminiRosterResponse('```json\n{"teams":[{"players":[]}]}\n```');
        expect(teams).toHaveLength(1);
    });

    it('説明文が前後に付いていても読む', () => {
        const teams = parseGeminiRosterResponse('はい、読み取りました。\n[{"number":4,"name":"田中"}]\n以上です。');
        expect(teams[0].players).toHaveLength(1);
    });

    it('JSONでなければ空を返す', () => {
        expect(parseGeminiRosterResponse('申し訳ありませんが読み取れませんでした。')).toEqual([]);
    });

    it('playersが配列でないチームは捨てる', () => {
        const teams = parseGeminiRosterResponse('{"teams":[{"players":"なし"},{"players":[{"number":4,"name":"田中"}]}]}');
        expect(teams).toHaveLength(1);
    });
});
