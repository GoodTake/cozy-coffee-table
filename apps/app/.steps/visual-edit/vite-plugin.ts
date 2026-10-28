import type { Plugin } from 'vite';

export function stepsVisualEditRuntime(): Plugin {
  return {
    name: 'steps-visual-edit-runtime',
    apply: 'serve',
    transformIndexHtml() {
      return [{
        tag: 'script',
        attrs: {
          type: 'module',
          src: '/.steps/visual-edit/runtime.ts',
        },
        injectTo: 'body',
      }];
    },
  };
}
