import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';
import terser from '@rollup/plugin-terser';

export default [
  // Main application bundle
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/scripts/main.js',
      format: 'iife', // Immediately Invoked Function Expression for browser usage
      name: 'PDP1', // Global variable name if needed
      sourcemap: true,
      sourcemapExcludeSources: false // Include source content in source maps
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
        sourceMap: true,
        inlineSources: true
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
      }),

      // Minify the bundle
      terser({
        compress: {
          // Aggressive compression options
          drop_console: false, // Keep console logs for debugging
          drop_debugger: true, // Remove debugger statements
          pure_funcs: [], // Don't remove any function calls
          passes: 3, // Multiple passes for better compression
          keep_fargs: false, // Remove unused function arguments
          keep_infinity: false, // Convert Infinity to 1/0
          side_effects: true, // Remove code without side effects
          dead_code: true, // Remove unreachable code
          collapse_vars: true, // Collapse single-use vars
          reduce_vars: true, // Reduce variable assignments
          inline: true, // Inline functions
          unused: true, // Remove unused variables
          hoist_funs: true, // Hoist function declarations
          hoist_vars: true, // Hoist var declarations
          if_return: true, // Optimize if-return sequences
          join_vars: true, // Join consecutive var statements
          sequences: true, // Use comma operator
          properties: true, // Optimize property access
          comparisons: true, // Optimize comparisons
          evaluate: true, // Evaluate constant expressions
          booleans: true, // Optimize booleans
          loops: true, // Optimize loops
          toplevel: false, // Don't mangle top level
          warnings: false
        },
        mangle: {
          // Aggressive mangling
          keep_classnames: false, // Mangle class names
          keep_fnames: false, // Mangle function names
          reserved: [], // No reserved names
          toplevel: false, // Don't mangle top level
          safari10: true // Workarounds for Safari 10 bugs
        },
        format: {
          comments: false, // Remove all comments
          preamble: '', // No preamble
          quote_style: 0, // Use best quotes
          wrap_iife: true, // Wrap IIFE
          wrap_func_args: true, // Wrap function arguments
          ecma: 2020 // Use modern JS features
        }
      })
    ]
  },

  // Audio Worklet bundle
  {
    input: 'src/audio-worklet/pdp1-audio.ts',
    output: {
      file: 'dist/scripts/pdp1-audio.js',
      format: 'es', // ES module format for audio worklet
      sourcemap: true,
      sourcemapExcludeSources: false // Include source content in source maps
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
        sourceMap: true,
        inlineSources: true
      }),

      // Minify the audio worklet bundle
      terser({
        compress: {
          // Aggressive but safe compression for audio worklet
          drop_console: false, // Keep console logs for debugging
          drop_debugger: true, // Remove debugger statements
          pure_funcs: [], // Don't remove any function calls
          passes: 3, // Multiple passes for better compression
          keep_fargs: false, // Remove unused function arguments
          keep_infinity: false, // Convert Infinity to 1/0
          side_effects: true, // Remove code without side effects
          dead_code: true, // Remove unreachable code
          collapse_vars: true, // Collapse single-use vars
          reduce_vars: true, // Reduce variable assignments
          inline: true, // Inline functions
          unused: true, // Remove unused variables
          hoist_funs: true, // Hoist function declarations
          hoist_vars: true, // Hoist var declarations
          if_return: true, // Optimize if-return sequences
          join_vars: true, // Join consecutive var statements
          sequences: true, // Use comma operator
          properties: true, // Optimize property access
          comparisons: true, // Optimize comparisons
          evaluate: true, // Evaluate constant expressions
          booleans: true, // Optimize booleans
          loops: true, // Optimize loops
          toplevel: false, // Don't mangle top level
          warnings: false
        },
        mangle: {
          // Careful mangling for audio worklet
          keep_classnames: true, // Keep class names (audio worklets need them)
          keep_fnames: false, // Can mangle function names
          reserved: ['PDP1AudioProcessor', 'process', 'currentTime', 'sampleRate', 'currentFrame', 'outputBuffer', 'parameters'], // Reserve critical names
          toplevel: false, // Don't mangle top level
          safari10: true // Workarounds for Safari 10 bugs
        },
        format: {
          comments: false, // Remove all comments
          preamble: '', // No preamble
          quote_style: 0, // Use best quotes
          wrap_iife: false, // Don't wrap (modules)
          wrap_func_args: true, // Wrap function arguments
          ecma: 2020 // Use modern JS features
        }
      })
    ]
  }
];