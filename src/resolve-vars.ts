import * as vscode from 'vscode';

const CMAKE_LAUNCH_COMMANDS_PREFIX = 'cmake.launch';

/**
 * Resolves variables in a string.
 * @details Very simple function to resolve workspace directory and expand
 * 3rd-party commands
 *
 * @param input - The input string containing variables to resolve.
 * @returns A Promise that resolves to the string with resolved variables.
 */
export async function resolveVariablesInString(input: string): Promise<string> {
  const activeEditor = vscode.window.activeTextEditor;

  const variableRegex = /\${([^}]+)}/g;
  const variableMatches = input.match(variableRegex);

  if (!variableMatches) {
    return input;
  }

  const resolvedValues: string[] =
      await Promise.all(variableMatches.map(async (variableMatch) => {
        const variable = variableMatch.slice(2, -1);

        if (variable.startsWith('command:')) {
          const command = variable.slice('command:'.length);
          if (command.startsWith(CMAKE_LAUNCH_COMMANDS_PREFIX))
            return await vscode.commands.executeCommand(command.replace(
                CMAKE_LAUNCH_COMMANDS_PREFIX, 'cmake.getLaunch'));

          return await vscode.commands.executeCommand(command);
        } else {
          switch (variable) {
          case 'workspaceFolder':
          case 'fileWorkspaceFolder':
            return activeEditor
                       ? vscode.workspace
                                 .getWorkspaceFolder(activeEditor?.document.uri)
                                 ?.uri.fsPath ??
                             ''
                       : '';
          default:
            return '';
          }
        }
      }));

  let resolvedString = input;
  variableMatches.forEach((variableMatch, index) => {
    const resolved = resolvedValues[index];
    if (resolved.length != 0)
      resolvedString =
          resolvedString.replace(variableMatch, resolvedValues[index]);
  });

  return resolvedString;
}