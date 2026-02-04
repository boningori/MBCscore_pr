// 開発用：サンプル試合データ生成スクリプト
// ブラウザのコンソールで実行するか、開発時にインポートして使用

import type { Team, Player } from '../types/game';
import { createInitialStats, createInitialGameInfo } from '../types/game';
import type { GameRecord } from './gameHistoryStorage';

const GAME_HISTORY_KEY = 'minibasket-game-history';

// サンプル選手データ
const sampleMyTeamPlayers: Partial<Player>[] = [
    { number: 4, name: '田中 太郎', isCaptain: true },
    { number: 5, name: '山田 花子', isCaptain: false },
    { number: 7, name: '佐藤 次郎', isCaptain: false },
    { number: 8, name: '鈴木 美咲', isCaptain: false },
    { number: 10, name: '高橋 健太', isCaptain: false },
    { number: 11, name: '渡辺 さくら', isCaptain: false },
    { number: 12, name: '小林 大輔', isCaptain: false },
    { number: 15, name: '加藤 結衣', isCaptain: false },
];

// ランダムなスタッツを生成
function generateRandomStats() {
    const twoPointAttempt = Math.floor(Math.random() * 8);
    const twoPointMade = Math.floor(Math.random() * (twoPointAttempt + 1));
    const threePointAttempt = Math.floor(Math.random() * 4);
    const threePointMade = Math.floor(Math.random() * (threePointAttempt + 1));
    const freeThrowAttempt = Math.floor(Math.random() * 6);
    const freeThrowMade = Math.floor(Math.random() * (freeThrowAttempt + 1));

    return {
        ...createInitialStats(),
        points: twoPointMade * 2 + threePointMade * 3 + freeThrowMade,
        twoPointMade,
        twoPointAttempt,
        threePointMade,
        threePointAttempt,
        freeThrowMade,
        freeThrowAttempt,
        offensiveRebounds: Math.floor(Math.random() * 4),
        defensiveRebounds: Math.floor(Math.random() * 6),
        assists: Math.floor(Math.random() * 5),
        steals: Math.floor(Math.random() * 3),
        blocks: Math.floor(Math.random() * 2),
        turnovers: Math.floor(Math.random() * 4),
    };
}

// 選手オブジェクトを生成
function createSamplePlayer(id: string, template: Partial<Player>): Player {
    return {
        id,
        number: template.number || 0,
        name: template.name || '',
        isCaptain: template.isCaptain || false,
        fouls: [],
        stats: generateRandomStats(),
        quartersPlayed: [
            Math.random() > 0.3 ? 'starter' : false,
            Math.random() > 0.3 ? 'starter' : false,
            Math.random() > 0.3 ? 'starter' : false,
            Math.random() > 0.3 ? 'starter' : false,
        ],
        isOnCourt: false,
    };
}

// サンプルチームを生成
function createSampleTeam(id: string, name: string, isMyTeam: boolean): Team {
    const playerTemplates = isMyTeam ? sampleMyTeamPlayers : [
        { number: 1, name: '対戦選手A', isCaptain: true },
        { number: 2, name: '対戦選手B' },
        { number: 3, name: '対戦選手C' },
        { number: 4, name: '対戦選手D' },
        { number: 5, name: '対戦選手E' },
    ];

    return {
        id,
        name,
        coachName: isMyTeam ? '山本 監督' : '相手 監督',
        assistantCoachName: '',
        players: playerTemplates.map((p, i) => createSamplePlayer(`${id}-player-${i}`, p)),
        timeouts: [],
        teamFouls: [2, 3, 2, 1],
        coachFouls: [],
        assistantCoachFouls: [],
        benchFouls: [],
        isMyTeam,
        color: isMyTeam ? 'white' : 'blue',
    };
}

// サンプル試合を生成
function createSampleGame(
    index: number,
    myTeamName: string,
    opponentName: string,
    gameDate: Date
): GameRecord {
    const teamA = createSampleTeam('teamA', myTeamName, true);
    const teamB = createSampleTeam('teamB', opponentName, false);

    const teamAScore = teamA.players.reduce((sum, p) => sum + p.stats.points, 0);
    const teamBScore = teamB.players.reduce((sum, p) => sum + p.stats.points, 0);

    return {
        id: `sample-game-${index}-${Date.now()}`,
        date: gameDate.toISOString(),
        gameName: `練習試合 ${index + 1}`,
        teamA,
        teamB,
        finalScore: {
            teamA: teamAScore,
            teamB: teamBScore,
        },
        scoreHistory: [],
        statHistory: [],
        foulHistory: [],
        gameInfo: createInitialGameInfo(),
        createdAt: new Date().toISOString(),
    };
}

// サンプルデータを生成してlocalStorageに保存
export function generateSampleGameData(myTeamName: string = 'MBC ジュニアズ', gameCount: number = 8): GameRecord[] {
    const opponents = [
        'ブルースパークス',
        'レッドファイターズ',
        'グリーンウィンズ',
        'イエローサンズ',
        'パープルウェーブス',
        'オレンジタイガース',
        'ブラックパンサーズ',
        'ホワイトイーグルス',
    ];

    const games: GameRecord[] = [];
    const now = new Date();

    for (let i = 0; i < gameCount; i++) {
        // 過去数週間にわたる試合日を生成
        const gameDate = new Date(now);
        gameDate.setDate(now.getDate() - (gameCount - i - 1) * 7);

        const opponent = opponents[i % opponents.length];
        const game = createSampleGame(i, myTeamName, opponent, gameDate);
        games.push(game);
    }

    // 既存データを保持しつつサンプルを追加
    try {
        const existing = localStorage.getItem(GAME_HISTORY_KEY);
        const existingGames: GameRecord[] = existing ? JSON.parse(existing) : [];

        // サンプルデータを除いた既存データを保持
        const filteredExisting = existingGames.filter(g => !g.id.startsWith('sample-game-'));

        // 新しいサンプルと既存データを合成
        const allGames = [...games, ...filteredExisting];
        allGames.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        localStorage.setItem(GAME_HISTORY_KEY, JSON.stringify(allGames));
        console.log(`✅ ${gameCount}件のサンプル試合データを生成しました`);
    } catch (error) {
        console.error('サンプルデータの保存に失敗:', error);
    }

    return games;
}

// サンプルデータを削除
export function clearSampleGameData(): void {
    try {
        const existing = localStorage.getItem(GAME_HISTORY_KEY);
        if (!existing) return;

        const games: GameRecord[] = JSON.parse(existing);
        const filtered = games.filter(g => !g.id.startsWith('sample-game-'));

        localStorage.setItem(GAME_HISTORY_KEY, JSON.stringify(filtered));
        console.log('✅ サンプル試合データを削除しました');
    } catch (error) {
        console.error('サンプルデータの削除に失敗:', error);
    }
}

// マイチームのサンプルデータも生成
export function generateSampleMyTeam(teamName: string = 'MBC ジュニアズ'): void {
    const MY_TEAMS_KEY = 'minibasket-my-teams';

    const sampleTeam = {
        id: `sample-myteam-${Date.now()}`,
        name: teamName,
        coachName: '山本 監督',
        coachLicenseNo: '',
        assistantCoachName: '田中 コーチ',
        assistantCoachLicenseNo: '',
        players: sampleMyTeamPlayers.map((p) => ({
            number: p.number,
            name: p.name,
            isCaptain: p.isCaptain,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    try {
        const existing = localStorage.getItem(MY_TEAMS_KEY);
        const teams = existing ? JSON.parse(existing) : [];

        // 同名チームがなければ追加
        if (!teams.some((t: any) => t.name === teamName)) {
            teams.push(sampleTeam);
            localStorage.setItem(MY_TEAMS_KEY, JSON.stringify(teams));
            console.log(`✅ マイチーム「${teamName}」を作成しました`);
        } else {
            console.log(`⚠️ 「${teamName}」は既に存在します`);
        }
    } catch (error) {
        console.error('マイチームの保存に失敗:', error);
    }
}

// 全サンプルデータを一括生成（開発用）
export function setupDevelopmentData(): void {
    const teamName = 'MBC ジュニアズ';
    generateSampleMyTeam(teamName);
    generateSampleGameData(teamName, 8);
    console.log('🏀 開発用サンプルデータのセットアップが完了しました');
    console.log('ページを更新して「選手スタッツ分析」をご確認ください');
}
