import * as vscode from 'vscode';

import {CMakeToolsIntegration} from './cmake-tools';

/**
 *  This method is called when the extension is activated. The extension is
 *  activated the very first time a command is executed.
 */
export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(new CMakeToolsIntegration());
}
