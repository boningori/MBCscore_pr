import { useState, useEffect, useCallback, useRef } from 'react';
import type { VoiceCommand } from '../utils/voiceCommands';
import { parseVoiceCommand, isValidCommand } from '../utils/voiceCommands';

interface UseVoiceInputOptions {
    onCommand?: (command: VoiceCommand) => void;
    continuous?: boolean;
    language?: string;
}

interface UseVoiceInputReturn {
    isListening: boolean;
    isSupported: boolean;
    transcript: string;
    lastCommand: VoiceCommand | null;
    error: string | null;
    startListening: () => void;
    stopListening: () => void;
    toggleListening: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
    const {
        onCommand,
        continuous = true,
        language = 'ja-JP',
    } = options;

    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
    const [error, setError] = useState<string | null>(null);

    const recognitionRef = useRef<SpeechRecognition | null>(null);

    // Web Speech API対応確認
    const isSupported = typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    useEffect(() => {
        if (!isSupported) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.lang = language;
        recognition.continuous = continuous;
        recognition.interimResults = true;

        recognition.onstart = () => {
            setIsListening(true);
            setError(null);
        };

        recognition.onend = () => {
            setIsListening(false);
            // continuous mode で自動再開
            if (continuous && recognitionRef.current) {
                try {
                    recognition.start();
                } catch (e) {
                    // 既に開始している場合は無視
                }
            }
        };

        recognition.onerror = (event) => {
            setError(event.error);
            if (event.error === 'not-allowed') {
                setIsListening(false);
            }
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            setTranscript(interimTranscript || finalTranscript);

            if (finalTranscript) {
                const command = parseVoiceCommand(finalTranscript);
                setLastCommand(command);

                if (isValidCommand(command) && onCommand) {
                    onCommand(command);
                }
            }
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.stop();
            recognitionRef.current = null;
        };
    }, [isSupported, language, continuous, onCommand]);

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening) {
            try {
                recognitionRef.current.start();
            } catch (e) {
                // 既に開始している場合は無視
            }
        }
    }, [isListening]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    }, []);

    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    }, [isListening, startListening, stopListening]);

    return {
        isListening,
        isSupported,
        transcript,
        lastCommand,
        error,
        startListening,
        stopListening,
        toggleListening,
    };
}

// Import speech types


