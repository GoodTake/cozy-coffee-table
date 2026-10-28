import path from 'node:path';
import type { PluginObj, PluginPass } from '@babel/core';

type BabelTypes = typeof import('@babel/core')['types'];

type MarkerState = PluginPass;

const MARKER_ATTRIBUTE = 'data-steps-loc';

export default function stepsEditMarker({ types: t }: { types: BabelTypes }): PluginObj<MarkerState> {
  return {
    name: 'steps-visual-edit-marker',
    visitor: {
      JSXOpeningElement(pathRef, state) {
        const start = pathRef.node.loc?.start;
        const filename = state.filename ?? state.file.opts.filename;
        if (!start || !filename) return;

        const projectRoot = state.file.opts.cwd ?? process.cwd();
        const relativePath = path.relative(projectRoot, filename).split('\\').join('/');
        if (!relativePath || relativePath.startsWith('../') || path.isAbsolute(relativePath)) return;

        const markerValue = `${relativePath}:${start.line}:${start.column + 1}`;
        pathRef.node.attributes = pathRef.node.attributes.filter((attribute) =>
          !(t.isJSXAttribute(attribute)
            && t.isJSXIdentifier(attribute.name, { name: MARKER_ATTRIBUTE })),
        );
        pathRef.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier(MARKER_ATTRIBUTE), t.stringLiteral(markerValue)),
        );
      },
    },
  };
}
