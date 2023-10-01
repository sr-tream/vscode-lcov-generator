import * as vscode from 'vscode';

export interface LaunchConfig {
  cwd?: string;
  program?: string;
}

export class LaunchConfigIntegration implements vscode.Disposable {
  private configChange: vscode.Disposable = {dispose() {}};
  private editorChange: vscode.Disposable = {dispose() {}};
  private configs: LaunchConfig[] = [];
  private onChangeConfigsEmiter = new vscode.EventEmitter<LaunchConfig[]>();

  constructor() {
    this.configChange =
        vscode.workspace.onDidChangeConfiguration(this.onChangeConfig, this);
    this.editorChange =
        vscode.window.onDidChangeActiveTextEditor(this.onChangeEditor, this);
    this.parseConfig(vscode.window.activeTextEditor?.document);
  }
  dispose() {
    this.configChange.dispose();
    this.editorChange.dispose();
  }

  public get onDidChangeLaunch(): vscode.Event<LaunchConfig[]> {
    return this.onChangeConfigsEmiter.event;
  }

  private async onChangeConfig(e: vscode.ConfigurationChangeEvent) {
    if (!e.affectsConfiguration('launch',
                                vscode.window.activeTextEditor?.document))
      return;
    this.parseConfig(vscode.window.activeTextEditor?.document);
  }

  private async onChangeEditor(e: vscode.TextEditor|undefined) {
    this.parseConfig(e?.document);
  }

  private async parseConfig(workspace: vscode.TextDocument|undefined) {
    const configurations =
        vscode.workspace.getConfiguration('launch', workspace)
            .get<LaunchConfig[]>('configurations');
    if (configurations === undefined)
      return;

    let configs: LaunchConfig[] = [];
    for (const config of configurations) {
      if (config.cwd === undefined || config.program === undefined)
        continue;
      const stripped = {cwd: config.cwd, program: config.program};
      if (!configs.includes(stripped))
        configs.push(stripped);
    }

    if (configs == this.configs)
      return;
    this.configs = configs;
    console.log(
        `[lcov-generator] Found launch configs: ${JSON.stringify(configs)}`);
    this.onChangeConfigsEmiter.fire(configs);
  }

  public getConfigs(): LaunchConfig[] { return this.configs; }
}