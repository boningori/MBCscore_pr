// Launch Handler API（window.launchQueue）の型定義。
//
// manifest の launch_handler: { client_mode: 'focus-existing' } を設定すると、
// 既存クライアントへフォーカスを戻す際のターゲットURLがここに積まれる。
// アイコン長押しショートカット（?s=...）を試合中に押した場合、
// この経路を受け取らないとURLだけ変わってナビゲーションが起きない。
//
// TypeScript標準libには無いため（現時点でChromium系のみ実装）、ここで宣言する。

interface LaunchParams {
    readonly targetURL: string;
    readonly files: ReadonlyArray<FileSystemFileHandle>;
}

interface LaunchQueue {
    setConsumer(consumer: (launchParams: LaunchParams) => void): void;
}

interface Window {
    launchQueue?: LaunchQueue;
}
