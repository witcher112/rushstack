// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as semver from 'semver';
import { Import } from '@rushstack/node-core-library';
import { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { DependencySpecifier } from '../../logic/DependencySpecifier';

// TODO: Convert this to "import type" after we upgrade to TypeScript 3.8
import * as PackageJsonUpdaterTypes from '../../logic/PackageJsonUpdater';
const packageJsonUpdaterModule: typeof PackageJsonUpdaterTypes = Import.lazy(
  '../../logic/PackageJsonUpdater',
  require
);

export class AddAction extends BaseRushAction {
  private _allFlag!: CommandLineFlagParameter;
  private _exactFlag!: CommandLineFlagParameter;
  private _caretFlag!: CommandLineFlagParameter;
  private _devDependencyFlag!: CommandLineFlagParameter;
  private _makeConsistentFlag!: CommandLineFlagParameter;
  private _skipUpdateFlag!: CommandLineFlagParameter;
  private _packageName!: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    const documentation: string[] = [
      'Adds a specified package as a dependency of the current project (as determined by the current working directory)' +
        ' and then runs "rush update". If no version is specified, a version will be automatically detected (typically' +
        ' either the latest version or a version that won\'t break the "ensureConsistentVersions" policy). If a version' +
        ' range (or a workspace range) is specified, the latest version in the range will be used. The version will be' +
        ' automatically prepended with a tilde, unless the "--exact" or "--caret" flags are used. The "--make-consistent"' +
        ' flag can be used to update all packages with the dependency.'
    ];
    super({
      actionName: 'add',
      summary: 'Adds a dependency to the package.json and runs rush upgrade.',
      documentation: documentation.join(os.EOL),
      safeForSimultaneousRushProcesses: false,
      parser
    });
  }

  public onDefineParameters(): void {
    this._packageName = this.defineStringParameter({
      parameterLongName: '--package',
      parameterShortName: '-p',
      required: true,
      argumentName: 'PACKAGE',
      description:
        '(Required) The name of the package which should be added as a dependency.' +
        ' A SemVer version specifier can be appended after an "@" sign.  WARNING: Symbol characters' +
        " are usually interpreted by your shell, so it's recommended to use quotes." +
        ' For example, write "rush add --package "example@^1.2.3"" instead of "rush add --package example@^1.2.3".'
    });
    this._exactFlag = this.defineFlagParameter({
      parameterLongName: '--exact',
      description:
        'If specified, the SemVer specifier added to the' +
        ' package.json will be an exact version (e.g. without tilde or caret).'
    });
    this._caretFlag = this.defineFlagParameter({
      parameterLongName: '--caret',
      description:
        'If specified, the SemVer specifier added to the' +
        ' package.json will be a prepended with a "caret" specifier ("^").'
    });
    this._devDependencyFlag = this.defineFlagParameter({
      parameterLongName: '--dev',
      description:
        'If specified, the package will be added to the "devDependencies" section of the package.json'
    });
    this._makeConsistentFlag = this.defineFlagParameter({
      parameterLongName: '--make-consistent',
      parameterShortName: '-m',
      description:
        'If specified, other packages with this dependency will have their package.json' +
        ' files updated to use the same version of the dependency.'
    });
    this._skipUpdateFlag = this.defineFlagParameter({
      parameterLongName: '--skip-update',
      parameterShortName: '-s',
      description:
        'If specified, the "rush update" command will not be run after updating the package.json files.'
    });
    this._allFlag = this.defineFlagParameter({
      parameterLongName: '--all',
      description: 'If specified, the dependency will be added to all projects.'
    });
  }

  public async runAsync(): Promise<void> {
    let projects: RushConfigurationProject[];
    if (this._allFlag.value) {
      projects = this.rushConfiguration.projects;
    } else {
      const currentProject:
        | RushConfigurationProject
        | undefined = this.rushConfiguration.tryGetProjectForPath(process.cwd());

      if (!currentProject) {
        throw new Error(
          'The "rush add" command must be invoked under a project' +
            ` folder that is registered in rush.json unless the ${this._allFlag.longName} is used.`
        );
      }

      projects = [currentProject];
    }

    if (this._caretFlag.value && this._exactFlag.value) {
      throw new Error(
        `Only one of "${this._caretFlag.longName}" and "${this._exactFlag.longName}" should be specified`
      );
    }

    let version: string | undefined = undefined;
    let packageName: string | undefined = this._packageName.value!;
    const parts: string[] = packageName.split('@');

    if (parts[0] === '') {
      // this is a scoped package
      packageName = '@' + parts[1];
      version = parts[2];
    } else {
      packageName = parts[0];
      version = parts[1];
    }

    if (!this.rushConfiguration.packageNameParser.isValidName(packageName)) {
      throw new Error(`The package name "${packageName}" is not valid.`);
    }

    if (version && version !== 'latest') {
      const specifier: DependencySpecifier = new DependencySpecifier(packageName, version);
      if (!semver.validRange(specifier.versionSpecifier) && !semver.valid(specifier.versionSpecifier)) {
        throw new Error(`The SemVer specifier "${version}" is not valid.`);
      }
    }

    const updater: PackageJsonUpdaterTypes.PackageJsonUpdater = new packageJsonUpdaterModule.PackageJsonUpdater(
      this.rushConfiguration,
      this.rushGlobalFolder
    );

    let rangeStyle: PackageJsonUpdaterTypes.SemVerStyle;
    if (version && version !== 'latest') {
      if (this._exactFlag.value || this._caretFlag.value) {
        throw new Error(
          `The "${this._caretFlag.longName}" and "${this._exactFlag.longName}" flags may not be specified if a ` +
            `version is provided in the ${this._packageName.longName} specifier. In this case "${version}" was provided.`
        );
      }

      rangeStyle = PackageJsonUpdaterTypes.SemVerStyle.Passthrough;
    } else {
      rangeStyle = this._caretFlag.value
        ? PackageJsonUpdaterTypes.SemVerStyle.Caret
        : this._exactFlag.value
        ? PackageJsonUpdaterTypes.SemVerStyle.Exact
        : PackageJsonUpdaterTypes.SemVerStyle.Tilde;
    }

    await updater.doRushAdd({
      projects: projects,
      packageName: packageName,
      initialVersion: version,
      devDependency: this._devDependencyFlag.value,
      updateOtherPackages: this._makeConsistentFlag.value,
      skipUpdate: this._skipUpdateFlag.value,
      debugInstall: this.parser.isDebug,
      rangeStyle: rangeStyle
    });
  }
}
