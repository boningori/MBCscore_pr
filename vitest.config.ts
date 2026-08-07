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
    },
});
