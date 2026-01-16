import { useState, useEffect, useCallback, useRef } from 'react';
import { QUARTER_DURATION_SECONDS } from '../types/game';

interface UseGameTimerOptions {
    initialSeconds?: number;
    onTick?: (seconds: number) => void;
    onEnd?: () => void;
}

interface UseGameTimerReturn {
    seconds: number;
    isRunning: boolean;
    formattedTime: string;
    start: () => void;
    pause: () => void;
    reset: (newSeconds?: number) => void;
    toggle: () => void;
}

export function useGameTimer(options: UseGameTimerOptions = {}): UseGameTimerReturn {
    const {
        initialSeconds = QUARTER_DURATION_SECONDS,
        onTick,
        onEnd,
    } = options;

    const [seconds, setSeconds] = useState(initialSeconds);
    const [isRunning, setIsRunning] = useState(false);
    const intervalRef = useRef<number | null>(null);
    const onTickRef = useRef(onTick);
    const onEndRef = useRef(onEnd);

    // コールバック参照の更新
    useEffect(() => {
        onTickRef.current = onTick;
        onEndRef.current = onEnd;
    }, [onTick, onEnd]);

    // タイマーのインターバル処理
    useEffect(() => {
        if (isRunning && seconds > 0) {
            intervalRef.current = window.setInterval(() => {
                setSeconds((prev: number) => {
                    const newSeconds = prev - 1;
                    if (onTickRef.current) {
                        onTickRef.current(newSeconds);
                    }
                    if (newSeconds <= 0) {
                        setIsRunning(false);
                        if (onEndRef.current) {
                            onEndRef.current();
                        }
                        return 0;
                    }
                    return newSeconds;
                });
            }, 1000);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isRunning, seconds]);

    // タイムフォーマット (MM:SS)
    const formattedTime = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

    const start = useCallback(() => {
        if (seconds > 0) {
            setIsRunning(true);
        }
    }, [seconds]);

    const pause = useCallback(() => {
        setIsRunning(false);
    }, []);

    const reset = useCallback((newSeconds?: number) => {
        setIsRunning(false);
        setSeconds(newSeconds ?? initialSeconds);
    }, [initialSeconds]);

    const toggle = useCallback(() => {
        if (isRunning) {
            pause();
        } else {
            start();
        }
    }, [isRunning, start, pause]);

    return {
        seconds,
        isRunning,
        formattedTime,
        start,
        pause,
        reset,
        toggle,
    };
}
