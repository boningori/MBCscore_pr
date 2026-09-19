// Geminiが返した名簿JSONを解く。HTTPもTesseractも知らない純関数だけを置く。
//
// imageOCR.ts から切り出したのは、応答形式が1つに固定できないため。
// responseSchema を付けた応答は {"teams":[...]}、旧プロンプトとスキーマ非対応
// モデルは素の配列で返す。両方を受ける分岐はモックなしで確かめたい。

/** Geminiが返した選手1人分。値の妥当性は呼び出し側（imageOCR）が見る */
export interface RawPlayer {
    number?: unknown;
    name?: unknown;
    licenseNo?: unknown;
}

/** Geminiが返したチーム1つ分 */
export interface RawTeam {
    teamName?: string;
    players: RawPlayer[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 応答テキストからJSON値を取り出す。
 *
 * そのままパースできるならそれでよい（responseMimeType を付けた応答はこの経路）。
 * 説明文やコードフェンスが混じる場合に備え、最初の { から最後の } 、
 * 次に最初の [ から最後の ] の順で拾い直す。オブジェクトを先に見るのは、
 * {"teams":[...]} に配列の正規表現を当てると内側の配列だけが取れてしまい、
 * teamName と複数チームの情報が黙って落ちるため。
 *
 * 拾えた候補は「使える形」（配列、または teams 配列を持つオブジェクト）の
 * ときだけ採用する。説明文の中に選手1人分のオブジェクトだけが混じっている
 * 場合、{ から } の欲張りマッチがその中身（{"number":...}）を拾ってしまい、
 * 有効なJSONとしてパースは通るが teams も配列でもない。そこで即returnせず
 * 次の（配列の）パターンへ進む。
 */
function extractJson(text: string): unknown {
    const stripped = text.replace(/```(?:json)?/gi, '').trim();
    try {
        return JSON.parse(stripped);
    } catch {
        // 説明文が混じっている。下で拾い直す
    }
    for (const pattern of [/\{[\s\S]*\}/, /\[[\s\S]*\]/]) {
        const match = stripped.match(pattern);
        if (!match) continue;
        try {
            const candidate: unknown = JSON.parse(match[0]);
            if (Array.isArray(candidate) || (isObject(candidate) && Array.isArray(candidate.teams))) {
                return candidate;
            }
        } catch {
            // 次の形を試す
        }
    }
    return null;
}

/** 応答テキストを RawTeam[] に均す。解けなければ空配列 */
export function parseGeminiRosterResponse(text: string): RawTeam[] {
    const parsed = extractJson(text);

    // 素の配列＝1チーム分の選手一覧（旧プロンプト互換）
    if (Array.isArray(parsed)) return [{ players: parsed as RawPlayer[] }];

    if (isObject(parsed) && Array.isArray(parsed.teams)) {
        return parsed.teams
            .filter(isObject)
            .filter((team): team is Record<string, unknown> & { players: RawPlayer[] } =>
                Array.isArray(team.players))
            .map(team => ({
                teamName: typeof team.teamName === 'string' ? team.teamName : undefined,
                players: team.players,
            }));
    }

    return [];
}
