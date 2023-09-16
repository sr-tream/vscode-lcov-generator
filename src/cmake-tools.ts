import * as vscode from 'vscode';
import * as api from 'vscode-cmake-tools';

export class CMakeToolsIntegration implements vscode.Disposable {
  private projectChange: vscode.Disposable = {dispose() {}};
  private codeModelChange: vscode.Disposable|undefined;
  private cmakeTools: api.CMakeToolsApi|undefined;
  private project: api.Project|undefined;
  private projectPath: vscode.Uri|undefined;
  private gcovWatcher: vscode.FileSystemWatcher|undefined;
  private onChange: vscode.Disposable = {dispose() {}};
  private onCreate: vscode.Disposable = {dispose() {}};
  private onDelete: vscode.Disposable = {dispose() {}};

  constructor() {
    let cmakeTools = api.getCMakeToolsApi(api.Version.v1);
    if (cmakeTools === undefined)
      return;

    cmakeTools.then(api => {
      this.cmakeTools = api;
      if (this.cmakeTools === undefined)
        return;

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
    this.disposeFileWatcher();
  }

  disposeFileWatcher() {
    this.onChange.dispose();
    this.onCreate.dispose();
    this.onDelete.dispose();
    if (this.gcovWatcher)
      this.gcovWatcher.dispose();
  }

  async onActiveProjectChanged(path: vscode.Uri|undefined) {
    this.projectPath = path;
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

  async onCodeModelChanged() {
    const content = this.project?.codeModel;
    if (content === undefined)
      return;

    let files: Map<string, string[]> = new Map();
    content.configurations.forEach(configuration => {
      configuration.projects.forEach(project => {
        project.targets.forEach(
            target => {target.fileGroups?.forEach(
                fileGroup => {fileGroup.sources.forEach(source => {
                  const relBuildPath = target.sourceDirectory?.substring(
                      this.projectPath?.fsPath.length ?? 0);
                  const relObjPath = relBuildPath + '/CMakeFiles/' +
                                     target.name + '.dir/' + source + '.gcda';
                  let sep = relObjPath.lastIndexOf('/');
                  if (sep == -1)
                    sep = relObjPath.lastIndexOf('\\');
                  const relObjDir = relObjPath.substring(0, sep);
                  const clearFile = relObjPath.substring(sep + 1);
                  let list = files.get(relObjDir) ?? [];
                  list.push(clearFile);
                  files.set(relObjDir, list);
                })})});
      });
    });

    this.project?.getBuildDirectory().then(buildDirectory => {
      if (!buildDirectory?.startsWith(this.projectPath?.fsPath ?? '')) {
        console.warn(
            '[gcov-viewer-cmake] `vscode.workspace.createFileSystemWatcher` doesn\'t support watch files out of the workspace (BUG?)');
      }
      let glob = '';
      let gcovDirs: string[] = [];
      files.forEach((files, folder) => {
        const folderPath = buildDirectory + folder;
        gcovDirs.push(folderPath);

        if (glob.length !== 0)
          glob += ',';
        glob += '{' + folderPath + '}';
        if (files.length !== 0) {
          glob += '/{';
          files.forEach(file => {
            if (!glob.endsWith('{'))
              glob += ',';
            glob += file;
          })
          glob += '}';
        }
      })
      vscode.workspace.getConfiguration('gcovViewer', this.projectPath)
          .update('buildDirectories', gcovDirs,
                  vscode.ConfigurationTarget.Workspace);
      this.disposeFileWatcher();
      this.gcovWatcher =
          vscode.workspace.createFileSystemWatcher(glob);
      this.onChange =
          this.gcovWatcher.onDidChange(this.onGcovFilesChanged.bind(this));
      this.onCreate =
          this.gcovWatcher.onDidCreate(this.onGcovFilesChanged.bind(this));
      this.onDelete =
          this.gcovWatcher.onDidDelete(this.onGcovFilesChanged.bind(this));
    })
  }

  async onGcovFilesChanged(uri: vscode.Uri|undefined) {
    vscode.commands.executeCommand('gcov-viewer.reloadGcdaFiles');
  }
}
