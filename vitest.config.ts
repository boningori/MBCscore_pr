import { defineConfig } from 'vitest/config';

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
    },
    esbuild: {
        jsx: 'automatic',
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.test.{ts,tsx}'],
        // jsdom環境の生成が重く、ファイルを並列実行すると1テストあたりの実時間が
        // 既定の5秒を超えることがある（DetailViewの出力テストが実際に落ちた）。
        // 実装の問題ではなく実行環境の混み具合なので、余裕を持たせて
        // 「本当に固まっている」場合だけ止まるようにする
        testTimeout: 20000,
        // このアプリはミニバス（9時開始・8時台受付が普通）向けで、日付まわりの
        // 実装・テストは「現地時刻＝日本時間」を前提に書かれている
        // （localDate.ts、mirrorBackupRetention.ts 参照）。開発機は日本時間だが
        // CI（GitHub Actions のubuntu-latest）は既定でUTCのため、そこだけ
        // 「現地とUTCの暦日が一致してしまい、JST特有の暦日ズレを検査できない」
        // という違いが出る（mirrorBackupRetention.test.ts の朝8時/9時のテストが
        // 実際にそれで常に真になっていた）。CIも開発機と同じ日本時間に揃えて、
        // どちらで実行しても同じことを検査できるようにする。
        // 固定前後でnpm test全体（2356件）が両方とも通ることを確認済み
        env: {
            TZ: 'Asia/Tokyo',
        },
    },
});
