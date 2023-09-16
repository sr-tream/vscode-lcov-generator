import * as vscode from 'vscode';

import {CMakeToolsIntegration} from './cmake-tools';

/**
 *  This method is called when the extension is activated. The extension is
 *  activated the very first time a command is executed.
 */
export async function activate(context: vscode.ExtensionContext) {
  const gcovViewer = vscode.extensions.getExtension('JacquesLucke.gcov-viewer');
  if (gcovViewer === undefined)
    vscode.window.showErrorMessage('Couldn\'t find gcov-viewer extension');

  const cmakeTools = vscode.extensions.getExtension('ms-vscode.cmake-tools');
  if (cmakeTools === undefined)
    vscode.window.showErrorMessage('Couldn\'t find cmake-tools extension');

  if (gcovViewer === undefined || cmakeTools === undefined)
    return;

  context.subscriptions.push(new CMakeToolsIntegration());
}
