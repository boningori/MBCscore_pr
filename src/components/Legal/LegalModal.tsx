import { useState } from 'react';
import { Modal } from '../Modal';
import './LegalModal.css';

export type LegalTab = 'terms' | 'privacy' | 'licenses';

interface LegalModalProps {
    isOpen: boolean;
    initialTab?: LegalTab;
    onClose: () => void;
}

const OSS_LICENSES = [
    { name: 'React / React DOM', license: 'MIT License', url: 'https://github.com/facebook/react' },
    { name: 'Tesseract.js', license: 'Apache License 2.0', url: 'https://github.com/naptha/tesseract.js' },
    { name: 'jsPDF', license: 'MIT License', url: 'https://github.com/parallax/jsPDF' },
    { name: 'html2canvas', license: 'MIT License', url: 'https://github.com/niklasvh/html2canvas' },
    { name: 'DOMPurify', license: 'Apache License 2.0 / MPL 2.0', url: 'https://github.com/cure53/DOMPurify' },
    { name: 'Vite / vite-plugin-pwa', license: 'MIT License', url: 'https://github.com/vitejs/vite' },
];

export function LegalModal({ isOpen, initialTab = 'terms', onClose }: LegalModalProps) {
    const [tab, setTab] = useState<LegalTab>(initialTab);
    const [prevOpenState, setPrevOpenState] = useState<{ isOpen: boolean; initialTab: LegalTab }>({ isOpen, initialTab });

    // isOpenがfalse→trueに変化した、またはinitialTabが変わった際にタブをリセットする
    // （レンダー中の状態更新。useEffectでのcascading render警告を避けるため）
    if (isOpen && (isOpen !== prevOpenState.isOpen || initialTab !== prevOpenState.initialTab)) {
        setPrevOpenState({ isOpen, initialTab });
        setTab(initialTab);
    } else if (isOpen !== prevOpenState.isOpen) {
        setPrevOpenState({ isOpen, initialTab });
    }

    if (!isOpen) return null;

    return (
        <Modal
            onClose={onClose}
            overlayClassName="legal-modal-overlay"
            contentClassName="legal-modal"
            ariaLabel="法的情報（利用規約・プライバシー・ライセンス）"
        >
                <div className="legal-modal-header">
                    <div className="legal-tabs">
                        <button className={tab === 'terms' ? 'active' : ''} onClick={() => setTab('terms')}>利用規約</button>
                        <button className={tab === 'privacy' ? 'active' : ''} onClick={() => setTab('privacy')}>プライバシー</button>
                        <button className={tab === 'licenses' ? 'active' : ''} onClick={() => setTab('licenses')}>ライセンス</button>
                    </div>
                    <button className="legal-close" onClick={onClose} aria-label="閉じる">×</button>
                </div>

                <div className="legal-modal-body">
                    {tab === 'terms' && (
                        <div>
                            <h2>利用規約</h2>
                            <p>最終更新日: 2026年7月4日</p>

                            <h3>第1条（本アプリについて）</h3>
                            <p>
                                MBCscore（以下「本アプリ」）は、ミニバスケットボールの試合記録を支援するアプリです。
                                本アプリを利用することで、本規約に同意したものとみなされます。
                            </p>

                            <h3>第2条（記録の正確性・公式記録について）</h3>
                            <p>
                                本アプリはJBA（公益財団法人日本バスケットボール協会）公式スコアシートに準拠した
                                レイアウトを提供しますが、<strong>JBA公認製品ではありません</strong>。
                                本アプリの記録・出力はあくまで補助的なものであり、
                                公式記録は大会主催者が定める正規のスコアシートが優先されます。
                            </p>

                            <h3>第3条（データの管理）</h3>
                            <p>
                                本アプリのデータはすべてご利用の端末内に保存されます。
                                端末の故障・ブラウザのデータ消去等によるデータ消失について、
                                開発者は責任を負いません。定期的なバックアップ機能のご利用を推奨します。
                            </p>

                            <h3>第4条（免責事項）</h3>
                            <p>
                                本アプリは現状有姿で提供されます。開発者は、本アプリの利用により生じた
                                いかなる損害についても、法令で許容される最大限の範囲で責任を負わないものとします。
                            </p>

                            <h3>第5条（禁止事項）</h3>
                            <p>
                                本アプリの複製・改変・再配布による営利利用、リバースエンジニアリング、
                                第三者の権利を侵害する態様での利用を禁止します。
                            </p>

                            <h3>第6条（お問い合わせ）</h3>
                            <p>
                                本規約に関するお問い合わせ: <a href="mailto:mbcscore@gmail.com">mbcscore@gmail.com</a>
                            </p>
                        </div>
                    )}

                    {tab === 'privacy' && (
                        <div>
                            <h2>プライバシーポリシー</h2>
                            <p>最終更新日: 2026年7月4日</p>

                            <h3>1. データの保存場所</h3>
                            <p>
                                本アプリで入力された選手名・背番号・試合記録などのデータは、
                                <strong>すべてご利用の端末内（ブラウザのストレージ）にのみ保存されます</strong>。
                                開発者がこれらのデータを収集・閲覧することはありません。
                            </p>

                            <h3>2. 児童の個人情報について</h3>
                            <p>
                                ミニバスケットボールの特性上、本アプリでは児童の氏名等を扱います。
                                選手情報の入力・管理は、保護者またはチーム管理者の責任において、
                                必要な同意を得たうえで行ってください。
                                氏名の代わりにコートネーム（ニックネーム）のみで運用することも可能です。
                            </p>

                            <h3>3. 外部への送信</h3>
                            <p>
                                本アプリが外部にデータを送信するのは、<strong>OCR機能（高精度モード）を
                                ご自身のGoogle Gemini APIキーで利用した場合の撮影画像のみ</strong>です。
                                この送信はGoogle社のサーバーに対して行われ、
                                <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer">Google AI利用規約</a>が適用されます。
                                無料枠のAPIキーでは送信データがモデル改善に利用される可能性があるため、
                                有料プランの利用を推奨します。オフラインOCR（基本モード）では画像は端末外に送信されません。
                            </p>

                            <h3>4. アクセス解析・広告</h3>
                            <p>本アプリはアクセス解析ツール・広告・外部トラッキングを一切使用していません。</p>

                            <h3>5. エラーログ</h3>
                            <p>
                                アプリ内で発生したエラーの記録は端末内にのみ保存されます。
                                自動送信は行われず、ユーザーが明示的にコピーして送付した場合のみ開発者に届きます。
                            </p>

                            <h3>6. お問い合わせ</h3>
                            <p>
                                個人情報の取扱いに関するお問い合わせ: <a href="mailto:mbcscore@gmail.com">mbcscore@gmail.com</a>
                            </p>
                        </div>
                    )}

                    {tab === 'licenses' && (
                        <div>
                            <h2>オープンソースライセンス</h2>
                            <p>MBCscore v{__APP_VERSION__}</p>
                            <p>本アプリは以下のオープンソースソフトウェアを使用しています。</p>
                            <ul className="license-list">
                                {OSS_LICENSES.map(lib => (
                                    <li key={lib.name}>
                                        <a href={lib.url} target="_blank" rel="noopener noreferrer">{lib.name}</a>
                                        <span> — {lib.license}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="license-note">
                                各ライセンスの全文は、リンク先のリポジトリでご確認いただけます。
                            </p>
                        </div>
                    )}
                </div>
        </Modal>
    );
}
