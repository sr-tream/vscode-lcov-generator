import * as vscode from 'vscode';

import {LaunchConfig} from './launchers';

export type WatchedFolders = LaunchConfig[];

export class ExtensionConfig implements vscode.Disposable {
  private configChange: vscode.Disposable = {dispose() {}};
  private editorChange: vscode.Disposable = {dispose() {}};
  private onChangeConfigEmiter = new vscode.EventEmitter<void>();
  private onChangeWatchedFoldersEmiter =
      new vscode.EventEmitter<WatchedFolders>();
  private llvmProfdata: string = 'llvm-profdata';
  private llvmCov: string = 'llvm-cov';
  private lcov: string = 'lcov';
  private profrawExt: string = 'profraw';
  private copyLcovTo: string = '';
  private watchedFolders: WatchedFolders = [];

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

  public get onDidChangeConfig(): vscode.Event<void> {
    return this.onChangeConfigEmiter.event;
  }

  public get onDidChangeWatchedFolders(): vscode.Event<WatchedFolders> {
    return this.onChangeWatchedFoldersEmiter.event;
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
    const configuration =
        vscode.workspace.getConfiguration('lcov-generator', workspace);

    this.llvmProfdata =
        configuration.get<string>('llvmProfdata', 'llvm-profdata');
    this.llvmCov = configuration.get<string>('llvmCov', 'llvm-cov');
    this.lcov = configuration.get<string>('lcov', 'lcov');
    this.profrawExt = configuration.get<string>('profrawExt', 'profraw');
    this.copyLcovTo = configuration.get<string>('copyLcovTo', '');

    const WatchedFolders = configuration.get<WatchedFolders>('watchedFolders');
    if (WatchedFolders != this.watchedFolders) {
      if (WatchedFolders === undefined) {
        this.watchedFolders = [];
        this.onChangeWatchedFoldersEmiter.fire(this.watchedFolders);
      } else {
        this.watchedFolders = WatchedFolders;
        this.onChangeWatchedFoldersEmiter.fire(WatchedFolders);
      }
    }

    this.onChangeConfigEmiter.fire();
  }

  public getLlvmProfdata(): string { return this.llvmProfdata; }
  public getLlvmCov(): string { return this.llvmCov; }
  public getLcov(): string { return this.lcov; }
  public getProfrawExt(): string { return this.profrawExt; }
  public getCopyLcovTo(): string { return this.copyLcovTo; }
  public getWatchedFolders(): WatchedFolders { return this.watchedFolders; }
}