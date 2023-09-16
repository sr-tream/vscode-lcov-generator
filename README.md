### CMake integration for [Gcov Viewer](https://github.com/JacquesLucke/gcov-viewer) plugin.

This plugin watch changes for `.gcda` files and trigger `Gcov Viewer: Reload` command.

Requirements:

- [Gcov Viewer](https://marketplace.visualstudio.com/items?itemName=JacquesLucke.gcov-viewer) - `ext install JacquesLucke.gcov-viewer`
- [CMake Tools](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cmake-tools) - `ext install ms-vscode.cmake-tools`



### Limitations

CMake build directory must by inside of workspace - `vscode.workspace.createFileSystemWatcher` bug.