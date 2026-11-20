import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: './',
  build: { assetsInlineLimit: 65536 }, // 픽셀 폰트를 CSS 안에 넣어 한 파일로 배포
  test: { include: ['tests/**/*.test.ts'], globals: true },
});
