import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';

export default [
  // Main application bundle
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/scripts/main.js',
      format: 'iife', // Immediately Invoked Function Expression for browser usage
      name: 'PDP1', // Global variable name if needed
      sourcemap: true
    },
    plugins: [
      // Resolve node modules
      nodeResolve({
        browser: true,
        preferBuiltins: false
      }),

      // Convert CommonJS modules to ES6
      commonjs(),

      // Compile TypeScript
      typescript({
        tsconfig: './tsconfig.json',
        outputToFilesystem: false,
        module: 'esnext',
        declaration: false,
        declarationMap: false,
      }),

      // Copy public files to dist
      copy({
        targets: [
          {
            src: 'public/*',
            dest: 'dist',
            // Copy directories recursively
            copyOnce: true
          }
        ],
        verbose: true // Log copied files
      })
    ]
  },

  // Audio Worklet bundle
  {
    input: 'src/audio-worklet/pdp1-audio.ts',
    output: {
      file: 'dist/scripts/pdp1-audio.js',
      format: 'es', // ES module format for audio worklet
      sourcemap: true
    },
    plugins: [
      // Resolve node modules
      nodeResolve({
        browser: true,
        preferBuiltins: false
      }),

      // Convert CommonJS modules to ES6
      commonjs(),

      // Compile TypeScript with audio worklet config
      typescript({
        tsconfig: './tsconfig.audioworklet.json',
        outputToFilesystem: false,
        module: 'esnext',
        declaration: false,
        declarationMap: false,
      })
    ]
  }
];