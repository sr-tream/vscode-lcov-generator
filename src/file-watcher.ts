import * as child_process from 'child_process';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as vscode from 'vscode';

export interface WatchOptions {
  cwd: vscode.Uri|undefined;
  ext: string|undefined;
}

export interface CoverageInfo {
  path: vscode.Uri;
  coverage: string;
}

export class FileWatcher implements vscode.Disposable {
  private path: vscode.Uri|undefined;
  private exe: vscode.Uri|undefined;
  private watcher: vscode.FileSystemWatcher|undefined;
  private onChange: vscode.Disposable = {dispose() {}};
  private onCreate: vscode.Disposable = {dispose() {}};
  private onDelete: vscode.Disposable = {dispose() {}};
  private profdataList: string[] = [];
  private llvmProfdata: string = 'llvm-profdata';
  private llvmCov: string = 'llvm-cov';
  private lcov: string = 'lcov';
  private ext: string = 'profraw';
  private onUpdateCoverageEmiter = new vscode.EventEmitter<CoverageInfo>();
  public coverage: string = '';

  constructor(llvmProfdata: string, llvmCov: string, lcov: string) {
    this.updateTools(llvmProfdata, llvmCov, lcov);
  }
  dispose() { this.reset(); }

  private reset() {
    this.onChange.dispose();
    this.onCreate.dispose();
    this.onDelete.dispose();
    if (this.watcher)
      this.watcher.dispose();
    this.profdataList = [];
    this.coverage = '';
  }

  public updateTools(llvmProfdata: string, llvmCov: string, lcov: string) {
    this.llvmProfdata = llvmProfdata;
    this.llvmCov = llvmCov;
    this.lcov = lcov;
  }

  public async watch(exe: vscode.Uri, opt?: WatchOptions) {
    this.exe = exe;
    const uri =
        opt && opt.cwd ? opt.cwd : vscode.Uri.file(path.dirname(exe.fsPath));
    this.ext = opt && opt.ext ? opt.ext : 'profraw';

    vscode.workspace.fs.stat(uri)
        .then(stat => {
          if (stat.type === vscode.FileType.Directory)
            this.path = uri;
          else
            this.path = vscode.Uri.file(path.dirname(uri.fsPath));
        })

            this.reset();
    const pattern =
        `${uri.fsPath}/{*.${this.ext},**/*.${this.ext},*.gcda,**/*.gcda}`;
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.onChange =
        this.watcher.onDidChange(this.onProfrawFileChanged.bind(this));
    this.onCreate =
        this.watcher.onDidCreate(this.onProfrawFileChanged.bind(this));
    this.onDelete =
        this.watcher.onDidDelete(this.onProfrawFileDeleted.bind(this));
    glob.sync(pattern).forEach(
        file => { this.onProfrawFileChanged(vscode.Uri.file(file)); });
  }

  public get onDidChange(): vscode.Event<CoverageInfo> {
    return this.onUpdateCoverageEmiter.event;
  }

  public getCwd(): vscode.Uri|undefined { return this.path; }
  public getExe(): vscode.Uri|undefined { return this.exe; }
  public getExt(): string { return this.ext; }

  private async onProfrawFileChanged(uri: vscode.Uri) {
    const filePath = uri.fsPath;
    if (filePath.endsWith(`.${this.ext}`) &&
        !this.profdataList.includes(filePath))
      this.profdataList.push(uri.fsPath);

    this.generateLcov();
  }

  private async onProfrawFileDeleted(uri: vscode.Uri) {
    const index = this.profdataList.indexOf(uri.fsPath);
    if (index === -1)
      return;

    this.profdataList.splice(index, 1);

    this.generateLcov();
  }

  private async generateLcov() {
    try {
      if (this.profdataList.length != 0) {
        const defaultProf = `${this.path?.fsPath}/default.profraw`;
        fs.exists(defaultProf, exists => {
          if (exists)
            this.generateLcovForLLVM([defaultProf]);
          else
            this.generateLcovForLLVM(this.profdataList);
        });
      } else
        this.generateLcovForGNU();
    } catch {
    }
  }
  private async generateLcovForLLVM(profdata: string[]) {
    const mergedProfData = `${this.exe?.fsPath}.profdata`;
    this.executeProcess(this.llvmProfdata,
                        ['merge', `-output=${mergedProfData}`, ...profdata])
        .then(_ => {this.executeProcess(this.llvmCov,
                                        [
                                          'export', `${this.exe?.fsPath}`,
                                          '-format=lcov',
                                          `-instr-profile=${mergedProfData}`
                                        ])
                        .then(coverage => {
                          this.coverage = coverage;
                          if (this.path !== undefined)
                            this.onUpdateCoverageEmiter.fire(
                                {path: this.path, coverage: coverage});
                          fs.unlinkSync(mergedProfData);
                        })})
  }
  private async generateLcovForGNU() {
    this.executeProcess(this.lcov, ['--capture', '--directory', `.`])
        .then(coverage => {
          this.coverage = coverage;
          if (this.path !== undefined)
            this.onUpdateCoverageEmiter.fire(
                {path: this.path, coverage: coverage});
        })
  }

  private async executeProcess(command: string,
                               args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process =
          child_process.spawn(command, args, {cwd: this.path?.fsPath});

      let error = '';
      let output = '';

      process.stdout.on('data',
                        (data: Buffer) => { output += data.toString(); });

      process.stderr.on('data',
                        (data: Buffer) => { error += data.toString(); });

      process.on('error', (error: Error) => { reject(error); });

      process.on('close', (code: number) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(error));
        }
      });
    });
  }
}