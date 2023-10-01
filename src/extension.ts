import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import {CMakeToolsIntegration} from './cmake-tools';
import {ExtensionConfig, WatchedFolders} from './config';
import {CoverageInfo, FileWatcher, WatchOptions} from './file-watcher';
import {LaunchConfig, LaunchConfigIntegration} from './launchers';
import {resolveVariablesInString} from './resolve-vars';

class WatchList implements vscode.Disposable {
  public watchers: FileWatcher[] = [];
  private onChange: vscode.Disposable[] = [];
  private onUpdateCoverageEmiter = new vscode.EventEmitter<CoverageInfo>();

  constructor() {}
  dispose() { this.reset(); }

  public get onDidChangeCoverage(): vscode.Event<CoverageInfo> {
    return this.onUpdateCoverageEmiter.event;
  }

  public reset() {
    this.watchers.forEach(watcher => watcher.dispose());
    this.watchers = [];
    this.onChange.forEach(disposable => disposable.dispose());
    this.onChange = [];
  }

  public updateTools(llvmProfdata: string, llvmCov: string, lcov: string) {
    this.watchers.forEach(watcher =>
                              watcher.updateTools(llvmProfdata, llvmCov, lcov));
  }

  public addWatcher(llvmProfdata: string, llvmCov: string, lcov: string,
                    exe: vscode.Uri, opt?: WatchOptions) {
    const watcher = new FileWatcher(llvmProfdata, llvmCov, lcov);
    this.onChange.push(watcher.onDidChange(this.coverageChanged.bind(this)));
    watcher.watch(exe, opt);
    this.watchers.push(watcher);
  }

  private async coverageChanged(info: CoverageInfo) {
    this.onUpdateCoverageEmiter.fire(info);
  }

  public contains(exe: vscode.Uri, opt?: WatchOptions): boolean {
    const cwd =
        opt && opt.cwd ? opt.cwd : vscode.Uri.file(path.dirname(exe.fsPath));
    const ext = opt && opt.ext ? opt.ext : 'profraw';

    for (const watcher of this.watchers) {
      if ((watcher.getCwd() === undefined ||
           watcher.getCwd()?.fsPath == cwd?.fsPath) &&
          watcher.getExe()?.fsPath == exe?.fsPath && watcher.getExt() == ext) {
        return true;
      }
    }
    return false;
  }
}

class LcovGenerator implements vscode.Disposable {
  private customWatchers: WatchList|undefined;
  private cmakeWatchers: WatchList|undefined;
  private launchWatchers: WatchList|undefined;

  private onChangeCoverageCustom: vscode.Disposable = {dispose() {}};
  private onChangeCoverageCmake: vscode.Disposable = {dispose() {}};
  private onChangeCoverageLaunch: vscode.Disposable = {dispose() {}};

  private config: ExtensionConfig = new ExtensionConfig();
  private onChangeExtConfig: vscode.Disposable = {dispose() {}};
  private onChangeCustomWatchers: vscode.Disposable = {dispose() {}};

  // Resolved paths
  private llvmProfdata: string = 'llvm-profdata';
  private llvmCov: string = 'llvm-cov';
  private lcov: string = 'lcov';
  private copyLcovTo: string = '';

  private cmakeTools: CMakeToolsIntegration|undefined;
  private onChangeCmakeArtifacts: vscode.Disposable = {dispose() {}};

  private launch: LaunchConfigIntegration = new LaunchConfigIntegration();
  private onChangeLaunchConfig: vscode.Disposable = {dispose() {}};

  constructor() {
    this.onChangeExtConfig =
        this.config.onDidChangeConfig(this.extConfigChanged.bind(this));
    this.onChangeCustomWatchers = this.config.onDidChangeWatchedFolders(
        this.customWatchersChanged.bind(this));
    this.extConfigChanged().then(() => {
      this.customWatchersChanged(this.config.getWatchedFolders());

      try {
        this.cmakeTools = new CMakeToolsIntegration();
        this.onChangeCmakeArtifacts = this.cmakeTools.onDidChangeArtifacts(
            this.cmakeArtifactsChanged.bind(this));
        this.cmakeArtifactsChanged(this.cmakeTools.getArtifacts());
      } catch {
      }

      this.onChangeLaunchConfig =
          this.launch.onDidChangeLaunch(this.launchersChanged.bind(this));
      this.launchersChanged(this.launch.getConfigs());
    });
  }
  dispose() {
    this.onChangeCoverageCustom.dispose();
    this.onChangeCoverageCmake.dispose();
    this.onChangeCoverageLaunch.dispose();

    this.customWatchers?.dispose();
    this.cmakeWatchers?.dispose();
    this.launchWatchers?.dispose();

    this.onChangeExtConfig.dispose();
    this.onChangeCustomWatchers.dispose();
    this.config.dispose();

    this.onChangeCmakeArtifacts.dispose();
    this.cmakeTools?.dispose();

    this.onChangeLaunchConfig.dispose();
    this.launch.dispose();
  }

  private async coverageChanged(info: CoverageInfo) {
    if (this.copyLcovTo.length == 0) {
      const filePath = `${info.path.fsPath}/lcov.info`;
      fs.writeFile(filePath, info.coverage, (err) => {
        if (err === null)
          return;
        vscode.window.showErrorMessage(
            `Failed to write ${filePath}: ${err?.message}`);
      });
      return;
    }
    let lcov: string = info.coverage;
    this.customWatchers?.watchers.forEach(watcher => {
      if (watcher.coverage == info.coverage)
        return;
      lcov += '\n' + watcher.coverage;
    });
    this.cmakeWatchers?.watchers.forEach(watcher => {
      if (watcher.coverage == info.coverage)
        return;
      lcov += '\n' + watcher.coverage;
    });
    this.launchWatchers?.watchers.forEach(watcher => {
      if (watcher.coverage == info.coverage)
        return;
      lcov += '\n' + watcher.coverage;
    });
    const filePath = `${this.copyLcovTo}/lcov.info`;
    fs.writeFile(filePath, lcov, (err) => {
      if (err === null)
        return;
      vscode.window.showErrorMessage(
          `Failed to write ${filePath}: ${err.message}`);
    });
  }

  private async extConfigChanged() {
    resolveVariablesInString(this.config.getLlvmProfdata())
        .then(llvmProfdata => {
          this.llvmProfdata = llvmProfdata;
          this.customWatchers?.updateTools(llvmProfdata, this.llvmCov,
                                           this.lcov);
          this.cmakeWatchers?.updateTools(llvmProfdata, this.llvmCov,
                                          this.lcov);
          this.launchWatchers?.updateTools(llvmProfdata, this.llvmCov,
                                           this.lcov);
        });
    resolveVariablesInString(this.config.getLlvmCov()).then(llvmCov => {
      this.llvmCov = llvmCov;
      this.customWatchers?.updateTools(this.llvmProfdata, llvmCov, this.lcov);
      this.cmakeWatchers?.updateTools(this.llvmProfdata, llvmCov, this.lcov);
      this.launchWatchers?.updateTools(this.llvmProfdata, llvmCov, this.lcov);
    });
    resolveVariablesInString(this.config.getLcov()).then(lcov => {
      this.lcov = lcov;
      this.customWatchers?.updateTools(this.llvmProfdata, this.llvmCov, lcov);
      this.cmakeWatchers?.updateTools(this.llvmProfdata, this.llvmCov, lcov);
      this.launchWatchers?.updateTools(this.llvmProfdata, this.llvmCov, lcov);
    });
    resolveVariablesInString(this.config.getCopyLcovTo())
        .then(copyLcovTo => this.copyLcovTo = copyLcovTo);
  }
  private async customWatchersChanged(folders: WatchedFolders|undefined) {
    this.customWatchers?.dispose();
    if (folders === undefined || folders.length == 0)
      return;

    this.customWatchers = new WatchList();
    this.onChangeCoverageCustom = this.customWatchers.onDidChangeCoverage(
        this.coverageChanged.bind(this));
    for (const folder of folders) {
      if (folder.program === undefined)
        continue;

      const uri =
          vscode.Uri.file(await resolveVariablesInString(folder.program));
      const options: WatchOptions = {
        cwd: folder.cwd
                 ? vscode.Uri.file(await resolveVariablesInString(folder.cwd))
                 : undefined,
        ext: this.config.getProfrawExt()
      }

      if (this.cmakeWatchers?.contains(uri, options) ||
          this.launchWatchers?.contains(uri, options))
      continue;

      this.customWatchers.addWatcher(this.llvmProfdata, this.llvmCov, this.lcov,
                                     uri, options);
    }
  }

  private async cmakeArtifactsChanged(artifacts: string[]) {
    this.cmakeWatchers?.dispose();
    if (artifacts.length == 0)
      return;

    this.cmakeWatchers = new WatchList();
    this.onChangeCoverageCmake =
        this.cmakeWatchers.onDidChangeCoverage(this.coverageChanged.bind(this));
    for (const artifact of artifacts) {
      const uri = vscode.Uri.file(artifact);
      const options:
          WatchOptions = {cwd: undefined, ext: this.config.getProfrawExt()};

      if (this.customWatchers?.contains(uri, options) ||
          this.launchWatchers?.contains(uri, options))
        continue;

      this.cmakeWatchers.addWatcher(this.llvmProfdata, this.llvmCov, this.lcov,
                                    uri, options);
    }
  }

  private async launchersChanged(configs: LaunchConfig[]) {
    this.launchWatchers?.dispose();
    if (configs.length == 0)
      return;

    this.launchWatchers = new WatchList();
    this.onChangeCoverageLaunch = this.launchWatchers.onDidChangeCoverage(
        this.coverageChanged.bind(this));
    for (const config of configs) {
      if (config.program === undefined)
        continue;

      const uri =
          vscode.Uri.file(await resolveVariablesInString(config.program));
      const options: WatchOptions = {
        cwd: config.cwd
                 ? vscode.Uri.file(await resolveVariablesInString(config.cwd))
                 : undefined,
        ext: this.config.getProfrawExt()
      }

      if (this.customWatchers?.contains(uri, options) ||
          this.cmakeWatchers?.contains(uri, options))
      continue;

      this.launchWatchers.addWatcher(this.llvmProfdata, this.llvmCov, this.lcov,
                                     uri, options);
    }
  }
}

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(new LcovGenerator());
}
