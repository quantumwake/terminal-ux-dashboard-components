import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: [
        'react',
        'react-dom',
        'lucide-react',
        '@nivo/bar',
        '@nivo/line',
        '@nivo/pie',
        '@nivo/scatterplot',
        '@nivo/heatmap',
        'react-pivottable',
        '@uiw/react-codemirror',
        '@codemirror/lang-sql',
    ],
    treeshake: true,
    splitting: false,
});
