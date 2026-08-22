import { useState, useCallback, useMemo, useRef } from 'react';
import type { FoulType, FoulRecord, FreeThrowResult, ShotSituation, Player } from '../../types/game';
import { MAX_PERSONAL_FOULS, suggestFreeThrowCount } from '../../types/game';
import { formatPlayerNumber } from '../../utils/playerNumber';
import { getDisqualification, disqualificationMessage } from '../../utils/disqualification';
import { Modal, ConfirmModal } from '../Modal';
import { wouldOverflowFoulColumns } from '../../utils/foulColumns';
import './FoulInputFlow.css';

type Step = 'foulType' | 'shotSituation' | 'shotResult' | 'ftCount' | 'shooter' | 'ftResult';

/** 中断（タイムアウト・交代）で選ばせるチーム */
export interface InterruptTeam {
    id: 'teamA' | 'teamB';
    name: string;
    /** 現クォーターでタイムアウトを使用済みか */
    timeoutUsed: boolean;
}

const LONG_PRESS_DURATION = 500; // 長押し判定時間（ミリ秒）

// ステップ切り替え後にフォーカスを預ける先を探すセレクタ。
// Modal のフォーカストラップが辿る対象と揃えておかないと、
// トラップが数えない要素にフォーカスを置いてしまう
const STEP_FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * 6個目の確認で保留にした「本来やろうとしていたこと」。
 *
 * 関数をそのまま state に入れると React が更新関数と解釈するため、
 * 何をするつもりだったかを素のデータで持つ。
 */
type OverflowIntent =
    | { kind: 'pNormal' }
    | { kind: 'pShot' }
    | { kind: 'special'; foulType: FoulType };

interface FoulInputFlowProps {
    onComplete: (data: {
        foulType: FoulType;
        shotSituation: ShotSituation;
        shotMade: boolean;
        freeThrows: number;
        freeThrowResults: FreeThrowResult[];
        shooterPlayerId: string | null;
    }) => void;
    onCancel: () => void;
    hasSelectedPlayer: boolean;
    currentFoulCount?: number;
    /** ファウル中の選手の既存ファウル。退場・失格の判定に使う（省略時は判定しない） */
    currentFouls?: (FoulType | FoulRecord)[];
    playerName?: string;
    /** 確認ダイアログに出す背番号。同姓の選手が居ても取り違えないため（省略可） */
    playerNumber?: number;
    teamFouls: number;
    opponentTeamId: string;
    opponentPlayers: Player[];
    opponentTeamName: string;
    // ベンチファウルモード用
    benchFoulMode?: boolean;
    benchFoulType?: FoulType;
    benchFoulLabel?: string;
    showThreePoint?: boolean;  // 3P入力を使う試合か（未指定時true＝後方互換）
    /**
     * 試合中断（タイムアウト・交代）で選ばせるチーム。省略時は中断ブロックを出さない。
     *
     * 保留アクションの解決は過去のクォーターを後から埋める場合があり、そこで
     * タイムアウトを記録すると currentQuarter に付いて実際と食い違う。
     * その経路では渡さないことで出さない。
     */
    interruptTeams?: InterruptTeam[];
    /** タイムアウト記録の要求。省略時はタイムアウトのボタンを出さない */
    onRequestTimeout?: (teamId: 'teamA' | 'teamB') => void;
    /** 選手交代の要求。省略時は交代のボタンを出さない */
    onRequestSubstitution?: (teamId: 'teamA' | 'teamB') => void;
}

const FOUL_TYPES: { type: FoulType; label: string; description: string; requiresPlayer: boolean }[] = [
    { type: 'P', label: 'P', description: 'パーソナルファウル', requiresPlayer: true },
    { type: 'T', label: 'T', description: 'テクニカルファウル', requiresPlayer: true },
    { type: 'U', label: 'U', description: 'アンスポーツマンライク', requiresPlayer: true },
    { type: 'D', label: 'D', description: 'ディスクォリファイイング', requiresPlayer: true },
];

const SHOT_SITUATIONS: { value: ShotSituation; label: string }[] = [
    { value: '2P', label: '2Pシュート中' },
    { value: '3P', label: '3Pシュート中' },
];

export function FoulInputFlow({
    onComplete,
    onCancel,
    hasSelectedPlayer,
    currentFoulCount = 0,
    currentFouls,
    playerName,
    playerNumber,
    teamFouls,
    opponentPlayers,
    opponentTeamName,
    benchFoulMode = false,
    benchFoulType,
    benchFoulLabel,
    showThreePoint = true,
    interruptTeams,
    onRequestTimeout,
    onRequestSubstitution,
}: FoulInputFlowProps) {
    // ベンチファウルモードの場合は初期ステップをshooterに、FT本数を1本に設定
    const [step, setStep] = useState<Step>(benchFoulMode ? 'shooter' : 'foulType');
    const [foulType, setFoulType] = useState<FoulType | null>(benchFoulMode && benchFoulType ? benchFoulType : null);
    const [shotSituation, setShotSituation] = useState<ShotSituation>('none');
    const [freeThrows, setFreeThrows] = useState<number>(benchFoulMode ? 1 : 0);
    const [freeThrowResults, setFreeThrowResults] = useState<FreeThrowResult[]>(benchFoulMode ? [null as unknown as FreeThrowResult] : []);
    const [shooterPlayerId, setShooterPlayerId] = useState<string | null>(null);
    const [shotMade, setShotMade] = useState<boolean>(false);

    // 中断ブロックでどちらを押したか。null は初期状態（2つのボタンが出ている）
    const [interruptChoice, setInterruptChoice] = useState<'timeout' | 'substitution' | null>(null);

    /**
     * FTを1本でも入れた後にシューターを差し替えたときの、差し替える前のシューター。
     *
     * 規則では残りのFTは交代で入った選手が打つが、この記録が持てるシューターは
     * 1人だけ（FoulRecord.shooterPlayerId）なので、そのままでは表せない。
     * shooterLeftCourt に紐づけた告知だと、選び直した瞬間に画面が真っさらになり、
     * 「全部このシューターが打った」と読める画面で記録を押させることになる。
     * 記録するまで出し続けて、試合後に手で補記する判断ができるようにする。
     */
    const [priorShooterId, setPriorShooterId] = useState<string | null>(null);

    /**
     * 中断ブロックの行が入れ替わった直後にフォーカスを移すための予約。
     *
     * 押したボタンはその場でアンマウントされるため、フォーカスが body へ落ちる。
     * Modal の Escape とフォーカストラップはオーバーレイの onKeyDown なので、
     * モーダルの外へ落ちるとEscapeが効かず、Tabが暗幕の下の画面へ抜ける。
     * 入れ替わった先の先頭ボタンへ移して、フォーカスをダイアログ内に保つ。
     */
    const pendingInterruptFocus = useRef(false);

    // 行の先頭ボタンに付ける ref。予約されているときだけフォーカスを取る
    // （初回表示でシューター選択からフォーカスを奪わないため）
    const focusInterruptRow = useCallback((el: HTMLButtonElement | null) => {
        if (el && pendingInterruptFocus.current) {
            pendingInterruptFocus.current = false;
            el.focus();
        }
    }, []);

    // 中断の行を入れ替える。入れ替え後のフォーカス移動もここでまとめて予約する
    const switchInterruptRow = useCallback((choice: 'timeout' | 'substitution' | null) => {
        pendingInterruptFocus.current = true;
        setInterruptChoice(choice);
    }, []);

    /**
     * ステップが切り替わった直後にフォーカスを移すための予約。
     *
     * 中断ブロックの行入れ替えと同じ事情がステップの切り替えにもある。
     * 段ごとにブロックを丸ごと差し替えるので、押したボタンはその場で
     * アンマウントされ、フォーカスが body へ落ちる。落ちた先はモーダルの
     * 外なので、オーバーレイの onKeyDown に載っている Escape と
     * フォーカストラップがどちらも効かなくなる——「← 戻る」も
     * 端末の戻る操作も Escape 経由なのに、切り替えた直後こそ
     * 戻りたい場面で効かない。
     */
    const pendingStepFocus = useRef(false);

    // 各ステップのブロックに付ける ref。予約されているときだけ、
    // 新しく出たブロックの先頭のフォーカス可能要素へ移す。
    // 初回表示では予約が無いので、Modal 自身のフォーカス（data-autofocus →
    // 先頭）をそのまま活かす
    const focusStepSection = useCallback((el: HTMLDivElement | null) => {
        if (!el || !pendingStepFocus.current) return;
        pendingStepFocus.current = false;
        const first = el.querySelector<HTMLElement>(STEP_FOCUSABLE);
        // ブロックの中身が全部押せない状態（コート上に候補が居ないシューター
        // 選択など）でも body へ落とさない。ダイアログ本体は tabIndex={-1} を
        // 持つので、そこへ預けておけば Escape もタブ順も内側に残る
        (first ?? el.closest<HTMLElement>('[role="dialog"]'))?.focus();
    }, []);

    // ステップを進める／戻す。切り替え後のフォーカス移動もここでまとめて予約する
    const goToStep = useCallback((next: Step) => {
        pendingStepFocus.current = true;
        setStep(next);
    }, []);

    // 6個目以降になる記録は、様式のファウル欄（5枠）に載らない。
    // 押し切れば記録できるが、黙って作らせない
    const [overflowIntent, setOverflowIntent] = useState<OverflowIntent | null>(null);
    // currentFouls が無い呼び出し側でも黙って確認を素通りさせないよう、
    // 個数（currentFoulCount）だけでも判定できるようにしておく
    const willOverflowFoulColumns = currentFouls
        ? wouldOverflowFoulColumns(currentFouls)
        : currentFoulCount >= MAX_PERSONAL_FOULS;

    // 確認ダイアログは背番号から出す。同姓の選手は珍しくなく、スコアラーが
    // 照合するのは背番号。他の2箇所の警告（App.tsx の交代要員確認、
    // EditActionModal の付け替え警告）も #番号 で始まる
    const confirmPlayerLabel = playerNumber !== undefined
        ? `#${formatPlayerNumber(playerNumber)} ${playerName || ''}`.trim()
        : (playerName || '選手');

    // 長押し検出用
    const longPressTimer = useRef<number | null>(null);
    const isLongPress = useRef(false);

    // 5ファウルだけでなく D / U・T 2回も見る。どちらも5個目より先に来るため、
    // 数だけで判定すると「失格済みの選手に何の警告も出ない」ことになる
    const disqualification = currentFouls ? getDisqualification(currentFouls) : null;
    const isFouledOut = disqualification !== null || currentFoulCount >= MAX_PERSONAL_FOULS;

    // ペナルティ状態（チームファウル5個目以降）
    const isPenalty = teamFouls >= 4;

    // ステップタイトル
    const stepTitles: Record<Step, string> = {
        foulType: 'ファウル種類を選択',
        shotSituation: 'シュート状況を選択（シュートファウル）',
        shotResult: 'シュートの結果',
        ftCount: 'フリースロー本数を選択',
        ftResult: benchFoulMode && benchFoulLabel ? `${benchFoulLabel} - FT結果` : 'フリースロー結果を入力',
        shooter: benchFoulMode && benchFoulLabel ? `${benchFoulLabel} - シューター選択` : 'シューターを選択',
    };

    // FT本数の推奨値を計算
    const suggestedFtCount = useMemo(() => {
        if (!foulType) return 0;
        return suggestFreeThrowCount(foulType, teamFouls, shotSituation);
    }, [foulType, teamFouls, shotSituation]);

    // Pファウル通常タップ（シュート中でないファウル）
    const runPFoulNormalTap = useCallback(() => {
        setFoulType('P');
        setShotSituation('none');

        // ペナルティ状態（チームファウル5個目以降）ならFT入力へ
        if (isPenalty) {
            const suggested = 2; // ペナルティは2本
            setFreeThrows(suggested);
            setFreeThrowResults(new Array(suggested).fill(null));
            goToStep('shooter');
        } else {
            // ペナルティでなければ即記録完了
            onComplete({
                foulType: 'P',
                shotSituation: 'none',
                shotMade: false,
                freeThrows: 0,
                freeThrowResults: [],
                shooterPlayerId: null,
            });
        }
    }, [isPenalty, onComplete, goToStep]);

    // Pファウル長押し（シュートファウル）
    const runPFoulLongPress = useCallback(() => {
        setFoulType('P');
        if (showThreePoint) {
            goToStep('shotSituation');
        } else {
            // 3P非表示の試合ではシュートファウルは常に2P扱い（状況選択をスキップ）
            setShotSituation('2P');
            goToStep('shotResult');
        }
    }, [showThreePoint, goToStep]);

    // T/U/Dファウル選択
    const runSpecialFoulSelect = useCallback((type: FoulType) => {
        setFoulType(type);
        setShotSituation('none');
        // 推奨FT本数を設定
        const suggested = suggestFreeThrowCount(type, teamFouls, 'none');
        setFreeThrows(suggested);
        setFreeThrowResults(new Array(suggested).fill(null));
        goToStep('ftCount');
    }, [teamFouls, goToStep]);

    const runIntent = useCallback((intent: OverflowIntent) => {
        if (intent.kind === 'pNormal') runPFoulNormalTap();
        else if (intent.kind === 'pShot') runPFoulLongPress();
        else runSpecialFoulSelect(intent.foulType);
    }, [runPFoulNormalTap, runPFoulLongPress, runSpecialFoulSelect]);

    // 種類が決まった直後に確認する。シューターやFT結果まで入れさせてから
    // 止めると、入れた分が無駄になる
    const requestIntent = useCallback((intent: OverflowIntent) => {
        if (willOverflowFoulColumns) {
            setOverflowIntent(intent);
            return;
        }
        runIntent(intent);
    }, [willOverflowFoulColumns, runIntent]);

    const handlePFoulNormalTap = useCallback(() => {
        requestIntent({ kind: 'pNormal' });
    }, [requestIntent]);

    const handlePFoulLongPress = useCallback(() => {
        requestIntent({ kind: 'pShot' });
    }, [requestIntent]);

    const handleSpecialFoulSelect = useCallback((type: FoulType) => {
        requestIntent({ kind: 'special', foulType: type });
    }, [requestIntent]);

    // 長押し開始
    const handlePressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // タッチイベントの場合、ブラウザによるclick合成（ゴーストクリック）を防止
        if (e.type === 'touchstart') {
            e.preventDefault();
        }
        isLongPress.current = false;
        longPressTimer.current = window.setTimeout(() => {
            isLongPress.current = true;
            handlePFoulLongPress();
        }, LONG_PRESS_DURATION);
    }, [handlePFoulLongPress]);

    // 長押し終了
    const handlePressEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // タッチイベントの場合、ブラウザによるclick合成（ゴーストクリック）を防止
        if (e.type === 'touchend') {
            e.preventDefault();
        }
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        // 長押しでなければ通常タップとして処理
        if (!isLongPress.current) {
            handlePFoulNormalTap();
        }
    }, [handlePFoulNormalTap]);

    /**
     * Pファウルのキーボード操作。
     *
     * このボタンは長押しで分岐するため onMouseDown/onTouchStart で組んであり、
     * onClick を持たない。キーボードのEnter/Spaceが発火させるのは click なので、
     * Pファウルだけキーボードから記録できなかった（T/U/Dは onClick がある）。
     * ボタンを2つに割らずに、同じボタンへキー操作を足す:
     *   Enter / Space       → 通常のPファウル（タップ相当）
     *   Shift + Enter/Space → シュートファウル（長押し相当）
     */
    const handlePFoulKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        // 押しっぱなしのキーリピートで何個も記録されるのを防ぐ
        if (e.repeat) return;
        // Spaceのスクロールと、Enterが起こす合成clickを止める
        e.preventDefault();

        if (e.shiftKey) {
            handlePFoulLongPress();
        } else {
            handlePFoulNormalTap();
        }
    }, [handlePFoulLongPress, handlePFoulNormalTap]);

    // シュート状況選択（Pファウル長押し時のみ、2Pか3Pのみ）
    const handleShotSituationSelect = useCallback((situation: ShotSituation) => {
        setShotSituation(situation);
        // シュート中のファウル → シュート結果選択へ
        goToStep('shotResult');
    }, [goToStep]);

    // シュート結果選択（成功=バスケットカウント / 失敗）
    const handleShotResultSelect = useCallback((made: boolean) => {
        setShotMade(made);
        const suggested = suggestFreeThrowCount('P', teamFouls, shotSituation, made);
        setFreeThrows(suggested);
        setFreeThrowResults(new Array(suggested).fill(null));
        goToStep('shooter');
    }, [teamFouls, shotSituation, goToStep]);

    // FT本数選択
    const handleFtCountSelect = useCallback((count: number) => {
        setFreeThrows(count);
        if (count === 0) {
            // FT 0本の場合はファウルのみ記録
            onComplete({
                foulType: foulType!,
                shotSituation,
                shotMade,
                freeThrows: 0,
                freeThrowResults: [],
                shooterPlayerId: null,
            });
        } else {
            setFreeThrowResults(new Array(count).fill(null));
            goToStep('shooter');  // シューター選択へ
        }
    }, [foulType, shotSituation, shotMade, onComplete, goToStep]);

    // FT結果入力
    const handleFtResult = useCallback((index: number, result: FreeThrowResult) => {
        const newResults = [...freeThrowResults];
        newResults[index] = result;
        setFreeThrowResults(newResults);
    }, [freeThrowResults]);

    // FT結果入力完了 → 記録完了
    const handleFtResultComplete = useCallback(() => {
        // すべてのFT結果が入力されているか確認
        if (freeThrowResults.some(r => r === null)) {
            return;
        }
        if (!foulType || !shooterPlayerId) return;
        onComplete({
            foulType,
            shotSituation,
            shotMade,
            freeThrows,
            freeThrowResults: freeThrowResults as FreeThrowResult[],
            shooterPlayerId,
        });
    }, [freeThrowResults, foulType, shotSituation, shotMade, freeThrows, shooterPlayerId, onComplete]);

    // シューター選択
    const handleShooterSelect = useCallback((playerId: string) => {
        setShooterPlayerId(playerId);
    }, []);

    /**
     * ペナルティ中でもFTを与えないファウルのための出口。
     *
     * オフェンスファウル（player control foul）はチームファウルが5個目以降でも
     * FTにならない。ここが無いと、記録者に残るのは「2本とも失敗を入力する」
     * （相手シューターに架空のFTA2本が付いてFT%が狂う）か「キャンセルして
     * ファウル自体を記録しない」（チームファウルも進まない）かの2つだけになる。
     *
     * 出すのはペナルティ由来のPファウルだけ。シュートファウルのFT本数は
     * シュートの成否で決まるので、そちらに0本を許すと規則にない記録ができる。
     */
    const canSkipFreeThrows = !benchFoulMode && foulType === 'P' && shotSituation === 'none';

    const handleSkipFreeThrows = useCallback(() => {
        onComplete({
            foulType: 'P',
            shotSituation: 'none',
            shotMade: false,
            freeThrows: 0,
            freeThrowResults: [],
            shooterPlayerId: null,
        });
    }, [onComplete]);

    // シューター選択完了 → FT結果入力へ
    const handleShooterComplete = useCallback(() => {
        if (!shooterPlayerId) return;
        // 中断のチーム選択を開いたまま次のステップへ行くと、行き先の画面に
        // 「タイムアウトを記録するチーム」だけが居座る
        setInterruptChoice(null);
        goToStep('ftResult');
    }, [shooterPlayerId, goToStep]);

    /**
     * FT結果入力からシューターを選び直す。
     *
     * 1本でも入力済みなら、そのFTは差し替え前のシューターが打った分。
     * 覚えるのは最初の差し替え前だけ（すでに priorShooterId があるなら上書きしない）。
     * 2回目以降の差し替えで現在のシューターを上書きすると、2回差し替えて元の
     * 選手に戻ったときに priorShooterId === shooterPlayerId になり、告知が
     * 消えてしまう——入力済みのFTは最初のシューターが打った分のままなのに。
     */
    const handleChangeShooter = useCallback(() => {
        if (priorShooterId === null && shooterPlayerId && freeThrowResults.some(r => r !== null)) {
            setPriorShooterId(shooterPlayerId);
        }
        setInterruptChoice(null);
        goToStep('shooter');
    }, [priorShooterId, shooterPlayerId, freeThrowResults, goToStep]);

    // 中断のチーム選択。App 側が上にモーダルを重ねる。
    // このコンポーネントはマウントされたままなので入力途中の状態は残る
    const handleInterruptTeamSelect = useCallback((teamId: 'teamA' | 'teamB') => {
        if (interruptChoice === 'timeout') {
            onRequestTimeout?.(teamId);
        } else if (interruptChoice === 'substitution') {
            onRequestSubstitution?.(teamId);
        }
        switchInterruptRow(null);
    }, [interruptChoice, onRequestTimeout, onRequestSubstitution, switchInterruptRow]);

    // 戻るボタン
    const handleBack = useCallback(() => {
        // 中断のチーム選択を開いている間は、ステップを戻すより先にそれを閉じる。
        // Escape も端末の戻る操作も Modal 経由でここへ来るため、
        // 分岐を入れないとチーム選択を出したまま入力段階だけが巻き戻る
        if (interruptChoice !== null) {
            switchInterruptRow(null);
            return;
        }
        switch (step) {
            case 'shotSituation':
                goToStep('foulType');
                setFoulType(null);
                break;
            case 'shotResult':
                if (showThreePoint) {
                    goToStep('shotSituation');
                } else {
                    // shotSituationステップをスキップしているためファウル種類選択まで戻る
                    goToStep('foulType');
                    setFoulType(null);
                    setShotSituation('none');
                }
                setShotMade(false);
                break;
            case 'ftCount':
                if (['T', 'U', 'D'].includes(foulType!)) {
                    goToStep('foulType');
                    setFoulType(null);
                } else {
                    // Pファウルのシュートファウル時
                    goToStep(showThreePoint ? 'shotSituation' : 'shotResult');
                }
                break;
            case 'shooter':
                // ベンチファウルモードの場合はキャンセル
                if (benchFoulMode) {
                    onCancel();
                    return;
                }
                // シュートファウル（2P/3P）からの場合はshotResultへ
                // ペナルティからの場合はfoulTypeへ
                // T/U/DからはftCountへ
                if (['T', 'U', 'D'].includes(foulType!)) {
                    goToStep('ftCount');
                } else if (shotSituation !== 'none') {
                    goToStep('shotResult');
                } else {
                    goToStep('foulType');
                    setFoulType(null);
                }
                setShooterPlayerId(null);
                // シューターごと捨てるので、差し替えの食い違いも無くなる
                setPriorShooterId(null);
                break;
            case 'ftResult':
                goToStep('shooter');
                setFreeThrowResults(new Array(freeThrows).fill(null));
                // 入力済みのFTを捨てるので、差し替えの食い違いも無くなる
                setPriorShooterId(null);
                break;
        }
    }, [step, foulType, freeThrows, shotSituation, benchFoulMode, onCancel, showThreePoint, interruptChoice, switchInterruptRow, goToStep]);

    // FT成功数を計算
    const ftMadeCount = freeThrowResults.filter(r => r === 'made').length;
    const ftAllEntered = freeThrowResults.every(r => r !== null);

    // 中断ブロックはシューターが確定して以降だけ出す。
    // 確定前はシューターがアプリのどこにも入っておらず、中断から戻ると
    // 記録者の記憶しか頼りが無い。さらに候補リストは今のコート状況から
    // 毎回引き直すため、確定前に交代が入ると正しい選択肢が画面から消える。
    const canInterrupt =
        interruptTeams !== undefined &&
        interruptTeams.length > 0 &&
        (onRequestTimeout !== undefined || onRequestSubstitution !== undefined) &&
        shooterPlayerId !== null &&
        (step === 'shooter' || step === 'ftResult');

    // コート上の選手のみフィルタリング
    const availableShooters = opponentPlayers.filter(p => p.isOnCourt);

    // 選択済みのシューターは、交代で下がっても opponentPlayers 全体から引く。
    // availableShooters（isOnCourt で絞った配列）から探すと、負傷交代の瞬間に
    // 「シューター: #」だけが残って誰なのか読めなくなる
    const shooter = shooterPlayerId
        ? opponentPlayers.find(p => p.id === shooterPlayerId) ?? null
        : null;
    // 負傷・失格で下がった場合、残りのFTは交代で入った選手が打つ
    const shooterLeftCourt = shooter !== null && !shooter.isOnCourt;
    const ftAnyEntered = freeThrowResults.some(r => r !== null);

    // 途中でシューターを差し替えたときの告知。
    // 同じ選手を選び直した場合は誰の分もずれていないので出さない
    const priorShooterDiverged = priorShooterId !== null && priorShooterId !== shooterPlayerId;
    const priorShooter = priorShooterDiverged
        ? opponentPlayers.find(p => p.id === priorShooterId) ?? null
        : null;
    // 選手が見つからない場合でも告知そのものは出す（?? null で握りつぶすと
    // 「差し替えなし」に見えてしまい、安全側に倒れない）。今日の交代は
    // isOnCourt を切り替えるだけで配列から消さないため実際には起きないが、
    // 万一に備えて中身の分からない告知を出す
    const priorShooterLabel = priorShooter
        ? `#${formatPlayerNumber(priorShooter.number)} ${priorShooter.courtName || priorShooter.name}`
        : (priorShooterDiverged ? '（選手情報不明）' : '');

    return (
        // 共通のModalに載せる。ここは試合中いちばん深い階層のオーバーレイで、
        // 開いている間は背後のスコアボードや選手カードを触らせてはいけない。
        // dialog / フォーカストラップ / フォーカス復帰 / Escape をModalに任せる。
        //
        // 閉じる要求（端末の戻る操作・Escape）は画面上の「← 戻る」と同じく
        // 1ステップ戻す。onCancel に直結していたため、シューター選択やFT結果まで
        // 進んでいても入力全部が消えていた。最初のステップには戻り先が無いので
        // そこだけ従来どおり取り消しになる。
        // オーバーレイのタップでは閉じない。記録中にダイアログの外を触るのは
        // 日常的に起き、入力途中のファウルを捨てるには軽すぎる操作
        <Modal
            onClose={step === 'foulType' ? onCancel : handleBack}
            closeOnOverlayClick={false}
            overlayClassName="foul-input-flow-overlay"
            contentClassName="foul-input-flow"
            labelledBy="foul-input-title"
        >
            <>
                {/* ヘッダー */}
                <div className="foul-input-header">
                    <h3 id="foul-input-title">{stepTitles[step]}</h3>
                    {(step !== 'foulType' || benchFoulMode) && (
                        <button className="btn-back" onClick={handleBack}>
                            ← 戻る
                        </button>
                    )}
                </div>

                {/* ファウルアウト警告（対象選手の名乗りも兼ねる） */}
                {hasSelectedPlayer && isFouledOut && (
                    <div className="foul-warning">
                        ⚠️ {confirmPlayerLabel}は
                        {disqualification
                            ? `既に${disqualificationMessage(disqualification)}（ファウル${currentFoulCount}個）`
                            : `既に${currentFoulCount}個のファウル（ファウルアウト済み）`}
                    </div>
                )}

                {/*
                  誰のファウルとして記録するかを、どの段でも出す。
                  以前は「現在N個のファウル」を出すついでに名前が見えるだけで、
                  条件が currentFoulCount > 0 だった。つまりその選手の1個目
                  ——いちばん多いケース——では対象選手がどこにも出ず、
                  「ファウル種類を選択／チームファウル: 0個」しか読めなかった。
                  選手カードは暗幕の下なので、押し間違えても確定前に気づけない。
                  ファウルは失格判定と公式様式に直結するので、確認は常に出す。
                  ファウルアウト済みのときは上の警告が同じ名前を出しているので重ねない。
                  ベンチ・コーチのファウル（hasSelectedPlayer が false）は対象が
                  選手ではないので出さない。
                */}
                {hasSelectedPlayer && !isFouledOut && (
                    <div className="foul-count-info foul-target-info">
                        <span className="foul-target-label">ファウルした選手</span>
                        <span className="foul-target-player">{confirmPlayerLabel}</span>
                        {currentFoulCount > 0 && (
                            <span className="foul-target-count">
                                現在{currentFoulCount}個
                                {currentFoulCount >= 4 && <span className="foul-trouble"> (ファウルトラブル)</span>}
                            </span>
                        )}
                    </div>
                )}

                {/* チームファウル表示 */}
                {step === 'foulType' && (
                    <div className="team-foul-info">
                        チームファウル: {teamFouls}個
                        {/* 4個目までが済んだ状態なので、いま入力するファウルが5個目＝ペナルティ。
                            「次から」と読ませると、FT2本を求められた時に案内と食い違う */}
                        {isPenalty && <span className="penalty-warning"> (このファウルからペナルティ)</span>}
                    </div>
                )}

                {/* Step 1: ファウルタイプ選択 */}
                {step === 'foulType' && (
                    <div ref={focusStepSection} className="foul-type-list">
                        {/* Pファウル - タップ/長押しで分岐 */}
                        <button
                            className={`foul-type-btn ${!hasSelectedPlayer ? 'disabled' : ''} ${isFouledOut ? 'warning-context' : ''}`}
                            onMouseDown={hasSelectedPlayer ? handlePressStart : undefined}
                            onMouseUp={hasSelectedPlayer ? handlePressEnd : undefined}
                            onMouseLeave={() => {
                                if (longPressTimer.current) {
                                    clearTimeout(longPressTimer.current);
                                    longPressTimer.current = null;
                                }
                            }}
                            onTouchStart={hasSelectedPlayer ? handlePressStart : undefined}
                            onTouchEnd={hasSelectedPlayer ? handlePressEnd : undefined}
                            onKeyDown={hasSelectedPlayer ? handlePFoulKeyDown : undefined}
                            disabled={!hasSelectedPlayer}
                            aria-keyshortcuts="Enter Shift+Enter"
                            // 視覚的なヒントは「長押し」のままにして、キーボード用の案内は
                            // アクセシブルな説明として添える（表示レイアウトは変えない）
                            title="タップ／Enter: パーソナルファウル、長押し／Shift+Enter: シュートファウル"
                        >
                            <span className="foul-type-label">P</span>
                            <div className="foul-type-desc-container">
                                <span className="foul-type-desc">パーソナルファウル</span>
                                <span className="foul-type-hint">長押しでシュートファウル</span>
                            </div>
                        </button>

                        {/* T/U/Dファウル - 通常タップ */}
                        {FOUL_TYPES.filter(f => f.type !== 'P').map(foul => {
                            const isDisabled = foul.requiresPlayer && !hasSelectedPlayer;
                            return (
                                <button
                                    key={foul.type}
                                    className={`foul-type-btn ${isDisabled ? 'disabled' : ''} ${isFouledOut ? 'warning-context' : ''}`}
                                    onClick={() => handleSpecialFoulSelect(foul.type)}
                                    disabled={isDisabled}
                                >
                                    <span className="foul-type-label">{foul.label}</span>
                                    <span className="foul-type-desc">{foul.description}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Step 2: シュート状況選択 */}
                {step === 'shotSituation' && (
                    <div ref={focusStepSection} className="shot-situation-list">
                        {SHOT_SITUATIONS.map(situation => (
                            <button
                                key={situation.value}
                                className="shot-situation-btn"
                                onClick={() => handleShotSituationSelect(situation.value)}
                            >
                                {situation.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Step 2.5: シュート結果選択（バスケットカウント判定） */}
                {step === 'shotResult' && (
                    <div ref={focusStepSection} className="shot-result-list">
                        <button
                            className="shot-result-btn success"
                            onClick={() => handleShotResultSelect(true)}
                        >
                            シュート成功（バスケットカウント → FT1本）
                        </button>
                        <button
                            className="shot-result-btn fail"
                            onClick={() => handleShotResultSelect(false)}
                        >
                            シュート失敗（FT{shotSituation === '3P' ? '3' : '2'}本）
                        </button>
                    </div>
                )}

                {/* Step 3: FT本数選択 */}
                {step === 'ftCount' && (
                    <div ref={focusStepSection} className="ft-count-section">
                        <div className="ft-suggested">
                            推奨: {suggestedFtCount}本
                        </div>
                        <div className="ft-count-list">
                            {/* T/U/Dファウルは常にFTがあるので0本は選択不可 */}
                            {[0, 1, 2, 3]
                                .filter(count => !(['T', 'U', 'D'].includes(foulType!) && count === 0))
                                .map(count => (
                                    <button
                                        key={count}
                                        className={`ft-count-btn ${count === suggestedFtCount ? 'suggested' : ''}`}
                                        onClick={() => handleFtCountSelect(count)}
                                    >
                                        {count}本
                                    </button>
                                ))}
                        </div>
                    </div>
                )}

                {/* Step 4: シューター選択 */}
                {step === 'shooter' && (
                    <div ref={focusStepSection} className="shooter-section">
                        {shooterLeftCourt && (
                            <div className="shooter-left-warning">
                                ⚠️ シューターが交代でコートを離れました。FTを打つ選手を選び直してください。
                            </div>
                        )}
                        <div className="shooter-team-name">
                            {opponentTeamName}（コート上の選手）
                        </div>
                        <div className="shooter-list">
                            {availableShooters.map(player => (
                                <button
                                    key={player.id}
                                    className={`shooter-btn ${shooterPlayerId === player.id ? 'selected' : ''}`}
                                    onClick={() => handleShooterSelect(player.id)}
                                >
                                    <span className="shooter-number">#{formatPlayerNumber(player.number)}</span>
                                    <span className="shooter-name">{player.courtName || player.name}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            className="btn btn-primary shooter-complete"
                            onClick={handleShooterComplete}
                            disabled={!shooterPlayerId || shooterLeftCourt}
                        >
                            次へ
                        </button>
                        {canSkipFreeThrows && (
                            <button
                                className="btn btn-secondary shooter-no-ft"
                                onClick={handleSkipFreeThrows}
                            >
                                FTなし（オフェンスファウル等）
                                <span className="btn-desc">ペナルティ中でもFTにならないファウル</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Step 5: FT結果入力 */}
                {step === 'ftResult' && (
                    <div ref={focusStepSection} className="ft-result-section">
                        <div className="shooter-info">
                            シューター: #{shooter ? formatPlayerNumber(shooter.number) : ''} {shooter?.courtName || shooter?.name}
                        </div>
                        {/*
                          規則では、シューターが負傷・失格で下がったら残りのFTは
                          交代で入った選手が打つ。ところがこの記録が持てるシューターは
                          1人だけ（FoulRecord.shooterPlayerId）なので、1本でも打った後だと
                          正確には表せない。どちらに寄せるかは記録者に委ねたうえで、
                          ずれることを画面に出す
                        */}
                        {shooterLeftCourt && (
                            <div className="shooter-left-warning">
                                <div>⚠️ シューターが交代でコートを離れました。</div>
                                {ftAnyEntered && (
                                    <div className="shooter-left-detail">
                                        すでに入力したFTがあります。この記録が持てるシューターは1人だけなので、
                                        残りを交代選手が打った場合、個人の得点とFT%が実際とずれます。
                                        チームの得点は正しく記録されます。
                                    </div>
                                )}
                                <button
                                    className="btn btn-secondary shooter-left-change"
                                    onClick={handleChangeShooter}
                                >
                                    {ftAnyEntered ? 'シューターを変更' : 'シューターを選び直す'}
                                </button>
                            </div>
                        )}
                        {/*
                          差し替えた後も出し続ける告知。上の shooterLeftCourt の警告は
                          交代選手を選んだ時点で消えるため、それだけだと「入力済みのFTは
                          別の選手が打った」ことが画面のどこにも残らない。
                          記録は止めない。画面で把握できていれば手で補記できる
                        */}
                        {priorShooterDiverged && (
                            <div className="shooter-changed-warning">
                                ⚠️ 途中でシューターを変更しました。入力済みのFTには {priorShooterLabel} が打った分が含まれます。
                                この記録が持てるシューターは1人だけなので、個人の得点とFT%は手で補記してください。
                            </div>
                        )}
                        <div className="ft-result-list">
                            {Array.from({ length: freeThrows }).map((_, index) => (
                                <div key={index} className="ft-result-row">
                                    <span className="ft-result-label">{index + 1}本目:</span>
                                    <div className="ft-result-buttons">
                                        <button
                                            className={`ft-result-btn success ${freeThrowResults[index] === 'made' ? 'selected' : ''}`}
                                            onClick={() => handleFtResult(index, 'made')}
                                        >
                                            ○ 成功
                                        </button>
                                        <button
                                            className={`ft-result-btn fail ${freeThrowResults[index] === 'missed' ? 'selected' : ''}`}
                                            onClick={() => handleFtResult(index, 'missed')}
                                        >
                                            × 失敗
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="ft-result-summary">
                            結果: {ftMadeCount}/{freeThrows} 成功 (+{ftMadeCount}点)
                        </div>
                        <button
                            className="btn btn-primary ft-result-next"
                            onClick={handleFtResultComplete}
                            disabled={!ftAllEntered}
                        >
                            記録
                        </button>
                    </div>
                )}

                {/*
                  試合の中断（タイムアウト・選手交代）。
                  FT結果の入力ボタンと隣り合わせにすると誤タップするので、
                  区切り線で独立させてキャンセルの直上に置く。
                  チーム選択は同じ行を置き換える。モーダルを増やさないためと、
                  ただでさえ縦に長いこの画面の高さを増やさないため
                */}
                {canInterrupt && (
                    <div className="interrupt-section">
                        <div className="interrupt-title">試合の中断</div>
                        {interruptChoice === null ? (
                            <div className="interrupt-buttons">
                                {onRequestTimeout && (
                                    <button
                                        ref={focusInterruptRow}
                                        className="btn btn-secondary interrupt-btn"
                                        onClick={() => switchInterruptRow('timeout')}
                                    >
                                        <span aria-hidden="true">⏱</span> タイムアウト
                                    </button>
                                )}
                                {onRequestSubstitution && (
                                    <button
                                        ref={focusInterruptRow}
                                        className="btn btn-secondary interrupt-btn"
                                        onClick={() => switchInterruptRow('substitution')}
                                    >
                                        <span aria-hidden="true">🔄</span> 選手交代
                                    </button>
                                )}
                            </div>
                        ) : (
                            // 読み上げでは「東京中」というボタン名だけが読まれ、押すと
                            // タイムアウトなのか交代なのかが分からない。まとまりに
                            // 見出しを付けたうえで、各ボタンにも動作を入れる
                            <div
                                className="interrupt-team-select"
                                role="group"
                                aria-labelledby="interrupt-team-prompt"
                            >
                                <div className="interrupt-prompt" id="interrupt-team-prompt">
                                    {interruptChoice === 'timeout'
                                        ? 'タイムアウトを記録するチーム'
                                        : '選手交代をするチーム'}
                                </div>
                                <div className="interrupt-buttons">
                                    {(interruptTeams ?? []).map(team => {
                                        // 1クォーター1回。取り消しは既存のチップに任せる
                                        const used = interruptChoice === 'timeout' && team.timeoutUsed;
                                        const action = interruptChoice === 'timeout'
                                            ? 'タイムアウトを記録'
                                            : '選手交代';
                                        return (
                                            <button
                                                key={team.id}
                                                ref={focusInterruptRow}
                                                className={`btn btn-secondary interrupt-btn${used ? ' used' : ''}`}
                                                // disabled にすると支援技術がこのボタンを飛ばすため、
                                                // 「使用済みで押せない」ことを知る手段が無くなる。
                                                // 辿れるまま、押しても何も起きない状態にする
                                                aria-disabled={used || undefined}
                                                aria-label={`${team.name}の${action}${used ? '（このクォーターは記録済み）' : ''}`}
                                                onClick={() => {
                                                    if (used) return;
                                                    handleInterruptTeamSelect(team.id);
                                                }}
                                            >
                                                {team.name}{used ? '（済）' : ''}
                                            </button>
                                        );
                                    })}
                                    {/*
                                      「やめる」だけだと、すぐ下の「キャンセル」
                                      （入力途中のファウルを丸ごと捨てる）と読み分けられない。
                                      ここで取り消すのはチーム選択だけなのでそう名乗る
                                    */}
                                    <button
                                        className="btn btn-secondary interrupt-btn interrupt-cancel"
                                        onClick={() => switchInterruptRow(null)}
                                    >
                                        選択をやめる
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* キャンセルボタン */}
                <div className="foul-input-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>
                        キャンセル
                    </button>
                </div>

                {/*
                  6個目以降は公式様式のファウル欄（5枠）に載らない。
                  記録は止めず、承知のうえかどうかだけ確かめる。
                  打ち消し側が既定フォーカス（ConfirmModal の作法）
                */}
                {overflowIntent && (
                    <ConfirmModal
                        title={`このファウルは${currentFoulCount + 1}個目です`}
                        message={`${confirmPlayerLabel} は既に${currentFoulCount}ファウルです。6個目以降は公式様式のファウル欄（5枠）に記録できません。`}
                        note="チームファウルには加算されます。"
                        confirmLabel="記録する"
                        cancelLabel="やめる"
                        onConfirm={() => {
                            const intent = overflowIntent;
                            setOverflowIntent(null);
                            runIntent(intent);
                        }}
                        onCancel={() => setOverflowIntent(null)}
                    />
                )}
            </>
        </Modal>
    );
}
