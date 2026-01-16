// 音声コマンド解析ユーティリティ

export interface VoiceCommand {
    type: 'score' | 'stat' | 'foul' | 'timeout' | 'quarter' | 'unknown';
    playerNumber?: number;
    action?: string;
    teamColor?: 'white' | 'blue';
}

// 日本語の数字を数値に変換
const parseJapaneseNumber = (text: string): number | null => {
    const numberMap: Record<string, number> = {
        '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        'いち': 1, 'に': 2, 'さん': 3, 'よん': 4, 'し': 4, 'ご': 5,
        'ろく': 6, 'なな': 7, 'しち': 7, 'はち': 8, 'きゅう': 9, 'く': 9, 'じゅう': 10,
    };

    // 数字文字列をそのまま変換
    const directNumber = parseInt(text, 10);
    if (!isNaN(directNumber)) return directNumber;

    // 日本語変換
    if (numberMap[text] !== undefined) return numberMap[text];

    // 「十一」〜「九十九」の処理
    if (text.includes('十') || text.includes('じゅう')) {
        const parts = text.replace('じゅう', '十').split('十');
        const tens = parts[0] ? (numberMap[parts[0]] || 1) : 1;
        const ones = parts[1] ? (numberMap[parts[1]] || 0) : 0;
        return tens * 10 + ones;
    }

    return null;
};

// 背番号を抽出（「4番」「四番」「4」など）
const extractPlayerNumber = (text: string): number | null => {
    // 「N番」パターン
    const numberPattern = /(\d+)番/;
    const match = text.match(numberPattern);
    if (match) return parseInt(match[1], 10);

    // 日本語数字 + 番
    const japanesePattern = /([\u4e00-\u9fa5ぁ-んァ-ン]+)番/;
    const japMatch = text.match(japanesePattern);
    if (japMatch) {
        const num = parseJapaneseNumber(japMatch[1]);
        if (num !== null) return num;
    }

    // 単独の数字
    const singleNumber = /^(\d+)\s/;
    const singleMatch = text.match(singleNumber);
    if (singleMatch) return parseInt(singleMatch[1], 10);

    return null;
};

// 音声コマンドを解析
export const parseVoiceCommand = (transcript: string): VoiceCommand => {
    const text = transcript.toLowerCase().trim();

    // タイムアウト
    if (text.includes('タイムアウト') || text.includes('たいむあうと')) {
        return { type: 'timeout' };
    }

    // クォーター終了
    if (text.includes('クォーター終了') || text.includes('くぉーたー') || text.includes('終了')) {
        return { type: 'quarter' };
    }

    // 背番号を抽出
    const playerNumber = extractPlayerNumber(text);

    // チームカラー判別
    let teamColor: 'white' | 'blue' | undefined;
    if (text.includes('白') || text.includes('しろ') || text.includes('ホワイト')) {
        teamColor = 'white';
    } else if (text.includes('青') || text.includes('あお') || text.includes('ブルー')) {
        teamColor = 'blue';
    }

    // 得点
    if (text.includes('2点') || text.includes('にてん') || text.includes('ツーポイント') || text.includes('2ポイント')) {
        return { type: 'score', playerNumber: playerNumber || undefined, action: '2P', teamColor };
    }
    if (text.includes('3点') || text.includes('さんてん') || text.includes('スリーポイント') || text.includes('3ポイント') || text.includes('スリー')) {
        return { type: 'score', playerNumber: playerNumber || undefined, action: '3P', teamColor };
    }
    if (text.includes('フリースロー') || text.includes('ふりーすろー') || text.includes('ft') || text.includes('1点')) {
        return { type: 'score', playerNumber: playerNumber || undefined, action: 'FT', teamColor };
    }

    // 統計
    if (text.includes('オフェンスリバウンド') || text.includes('おふぇんすりばうんど') || text.includes('オフェンス') && text.includes('リバウンド')) {
        return { type: 'stat', playerNumber: playerNumber || undefined, action: 'OREB', teamColor };
    }
    if (text.includes('ディフェンスリバウンド') || text.includes('でぃふぇんすりばうんど') || text.includes('ディフェンス') && text.includes('リバウンド')) {
        return { type: 'stat', playerNumber: playerNumber || undefined, action: 'DREB', teamColor };
    }
    if (text.includes('リバウンド') || text.includes('りばうんど')) {
        return { type: 'stat', playerNumber: playerNumber || undefined, action: 'DREB', teamColor };  // デフォルトはディフェンス
    }
    if (text.includes('アシスト') || text.includes('あしすと')) {
        return { type: 'stat', playerNumber: playerNumber || undefined, action: 'AST', teamColor };
    }
    if (text.includes('スティール') || text.includes('すてぃーる')) {
        return { type: 'stat', playerNumber: playerNumber || undefined, action: 'STL', teamColor };
    }
    if (text.includes('ブロック') || text.includes('ぶろっく')) {
        return { type: 'stat', playerNumber: playerNumber || undefined, action: 'BLK', teamColor };
    }
    if (text.includes('ターンオーバー') || text.includes('たーんおーばー') || text.includes('ロスト')) {
        return { type: 'stat', playerNumber: playerNumber || undefined, action: 'TO', teamColor };
    }

    // ファウル
    if (text.includes('ファウル') || text.includes('ふぁうる') || text.includes('ファール')) {
        return { type: 'foul', playerNumber: playerNumber || undefined, action: 'P', teamColor };
    }
    if (text.includes('テクニカル') || text.includes('てくにかる')) {
        return { type: 'foul', playerNumber: playerNumber || undefined, action: 'T', teamColor };
    }

    return { type: 'unknown' };
};

// コマンドの形式が有効か
export const isValidCommand = (command: VoiceCommand): boolean => {
    if (command.type === 'unknown') return false;
    if (command.type === 'timeout' || command.type === 'quarter') return true;
    return command.playerNumber !== undefined && command.action !== undefined;
};
