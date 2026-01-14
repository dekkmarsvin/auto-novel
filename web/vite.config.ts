import fs from 'fs';
import path from 'path';
import vue from '@vitejs/plugin-vue';
import Sonda from 'sonda/vite';
import AutoImport from 'unplugin-auto-import/vite';
import imagemin from 'unplugin-imagemin/vite';
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';
import type { PluginOption, ServerOptions, UserConfig } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import tsconfigPaths from 'vite-tsconfig-paths';

<<<<<<< HEAD
const DEFAULT_REMOTE_ORIGIN = 'https://books.kotoban.top';

const normalizeOrigin = (originFromEnv?: string) => {
  if (!originFromEnv) return DEFAULT_REMOTE_ORIGIN;
  try {
    return new URL(originFromEnv).origin;
  } catch {
    return DEFAULT_REMOTE_ORIGIN;
  }
};

const enableSonda = process.env.ENABLE_SONDA === '1';
const enableLocalServer = process.env.LOCAL != undefined;

const defineServerOptions = (remoteOrigin: string): ServerOptions => {
  return {
    proxy: {
      '/api': {
        target: enableLocalServer
          ? 'http://localhost:8081'
          : remoteOrigin,
        changeOrigin: true,
        bypass: (req, _res, _options) => {
          if (
            !enableLocalServer &&
            req.url &&
            req.url.includes('/translate-v2/')
          ) {
            if (req.url.includes('/chapter/')) {
              console.log('检测到小说章节翻译请求，已拦截');
              return false;
            }
          }
        },
        rewrite: (path) => {
          if (enableLocalServer) {
            path = path.replace(/^\/api/, '');
          }
          return path;
        },
      },
      '/files-temp': {
        target: remoteOrigin,
        changeOrigin: true,
      },
    },
  };
};

const filesProxyPlugin = (): PluginOption => ({
  name: 'files-proxy',
  configureServer(server) {
    server.middlewares.use('/files-temp', (req, res) => {
      const url = new URL('http://localhost' + req.url);
      const ext = path.extname(url.pathname).toLowerCase();
      const mimeTypes = {
        '.epub': 'application/epub+zip',
        '.txt': 'text/plain',
      };
      res.setHeader(
        'content-type',
        mimeTypes[ext] || 'application/octet-stream',
      );

      const filePath = path.join(
        __dirname,
        '../server/data/files-temp',
        url.pathname,
      );
      const content = fs.readFileSync(filePath);
      res.end(content);
    });
  },
});

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const remoteOrigin = normalizeOrigin(env.ORIGIN_DOMAIN ?? env.VITE_ORIGIN_DOMAIN);
=======
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const apiMode = env.VITE_API_MODE;
  const apiUrl = (() => {
    if (apiMode === 'remote') {
      return 'https://n.novelia.cc';
    } else if (apiMode === 'local') {
      return 'http://localhost:80';
    } else if (apiMode === 'native') {
      return 'http://localhost:8081';
    }
    return 'https://n.novelia.cc';
  })();
  const enableSonda = env.VITE_ENABLE_SONDA === 'true';
>>>>>>> upstream/main

  const config: UserConfig = {
    build: {
      target: ['es2015'],
      cssCodeSplit: false,
      rollupOptions: {
        treeshake: true,
        output: {
          manualChunks(id) {
            if (id.includes('web/src')) {
              return 'chunk';
            } else if (id.includes('@zip.js')) {
              return 'dep-zip';
            } else if (id.includes('opencc')) {
              return 'dep-opencc';
            } else if (id.includes('naive')) {
              return 'dep-naive';
            } else if (id.includes('node_module')) {
              return 'dep';
            }
          },
        },
      },
    },
    server: {
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite:
            apiMode === 'native'
              ? (path: string) => path.replace(/^\/api/, '')
              : undefined,
          bypass: (req, _res, _options) => {
            if (
              apiMode === 'remote' &&
              req.url &&
              req.url.includes('/translate-v2/')
            ) {
              console.log('检测到小说章节翻译请求，已拦截');
              return false;
            }
          },
        },
        '/files-temp': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/files-extra': {
          target: 'https://n.novelia.cc',
          changeOrigin: true,
        },
      },
    },
    plugins: [
      vue(),
      imagemin({}),
      createHtmlPlugin({
        minify: { minifyJS: true },
      }),
      tsconfigPaths({ loose: true }),
      AutoImport({
        dts: 'src/auto-imports.d.ts',
        imports: [
          'vue',
          'vue-router',
          'pinia',
          {
            'naive-ui': [
              'useDialog',
              'useMessage',
              'useNotification',
              'useLoadingBar',
              'useThemeVars',
            ],
          },
        ],
      }),
      Components({
        dts: 'src/components.d.ts',
        dirs: ['src/**/components/**'],
        resolvers: [NaiveUiResolver()],
      }),
    ],
  };

  if (enableSonda) {
    config.build!.sourcemap = true;
    config.plugins!.push(
      Sonda({
        gzip: true,
        brotli: true,
      }),
    );
  }

  return config;
});

