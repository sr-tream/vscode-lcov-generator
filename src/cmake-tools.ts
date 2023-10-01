import * as vscode from 'vscode';
import * as api from 'vscode-cmake-tools';

export class CMakeToolsIntegration implements vscode.Disposable {
  private projectChange: vscode.Disposable = {dispose() {}};
  private codeModelChange: vscode.Disposable|undefined;
  private cmakeTools: api.CMakeToolsApi|undefined;
  private project: api.Project|undefined;
  private onChangeArtifactsEmiter = new vscode.EventEmitter<string[]>();
  private artifacts: string[] = [];

  constructor() {
    let cmakeTools = api.getCMakeToolsApi(api.Version.v1);

    cmakeTools.then(api => {
      this.cmakeTools = api;
      if (this.cmakeTools === undefined)
        throw new Error('Could not get CMakeToolsApi');

      this.projectChange = this.cmakeTools.onActiveProjectChanged(
          this.onActiveProjectChanged, this);
      if (vscode.workspace.workspaceFolders !== undefined) {
        const projectUri = vscode.workspace.workspaceFolders[0].uri;
        this.onActiveProjectChanged(projectUri);
      }
    });
  }
  dispose() {
    if (this.codeModelChange !== undefined)
      this.codeModelChange.dispose();
    this.projectChange.dispose();
  }

  public get onDidChangeArtifacts(): vscode.Event<string[]> {
    return this.onChangeArtifactsEmiter.event;
  }

  private async onActiveProjectChanged(path: vscode.Uri|undefined) {
    if (this.codeModelChange !== undefined) {
      this.codeModelChange.dispose();
      this.codeModelChange = undefined;
    }

    if (path === undefined)
      return;

    this.cmakeTools?.getProject(path).then(project => {
      this.project = project;
      this.codeModelChange =
          this.project?.onCodeModelChanged(this.onCodeModelChanged, this);
      this.onCodeModelChanged();
    });
  }

  private async onCodeModelChanged() {
    const content = this.project?.codeModel;
    if (content === undefined)
      return;

    let artifacts: string[] = [];
    content.configurations.forEach(configuration => {
      configuration.projects.forEach(project => {
        project.targets.forEach(target => {
          target.artifacts?.forEach(artifact => { artifacts.push(artifact); });
        });
      });
    });
    this.artifacts = artifacts;
    console.log(
        `[lcov-generator] Found CMake artifacts: ${artifacts.join(', ')}`);
    this.onChangeArtifactsEmiter.fire(artifacts);
  }

  public getArtifacts(): string[] { return this.artifacts; }
}
