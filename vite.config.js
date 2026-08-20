import { defineConfig } from 'vite';

export default defineConfig({
  // 使用相对资源路径，同时兼容 krysof.github.io/cowcome/ 与自定义域名根路径。
  base: './'
});
