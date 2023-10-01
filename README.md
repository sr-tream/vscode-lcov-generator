### Lcov Generator

This extension generate `lcov.info` files from LLVM profraw\* and GNU gcda files.

By default lcov file generates in folder with build artifacts\*\*, but folder may be specified in settings\*\*\*



\* When present `default.profraw` file - it used instead other profraw files. When `default.profraw` missed, all profraw files will be merged.

\*\* Path to build artifacts may be specified in settings and automaticly extracted from CMake and `launch.json`

\*\*\* For multiple artifacts coverage data merged in one file to save in one folder



To view generated data in VSCode, you may use [Coverage Gutters](https://marketplace.visualstudio.com/items?itemName=ryanluker.vscode-coverage-gutters)



### Motivation

This plugin is fork of [Gcov viever cmake](https://github.com/sr-tream/gcov-viewer-cmake). **Gcov viewer cmake** provide integration of [Gcov Viewer](https://github.com/JacquesLucke/gcov-viewer) with CMake via MS [CMake-tools](https://github.com/microsoft/vscode-cmake-tools) extension - this solution works fine, but we locked on CMake and (**important**) GNU toolkit, because LLVM generates too old gcov data, compatible with GCC 4.2.

This plugin generates lcov - so it can work with LLVM profraw files. Also this plugin can import configurations from `launch.json` and can work with non-cmake build systems.