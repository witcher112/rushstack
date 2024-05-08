// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';
import {
  type ILogMessageCallbackOptions,
  LogMessageIdentifier,
  type LogMessageDetails,
  LogMessageKind
} from 'pnpm-sync-lib';

export class PnpmSyncUtilities {
  private static _addLinePrefix(message: string): string {
    return message
      .split('\n')
      .map((x) => (x.trim() ? Colorize.cyan(`pnpm-sync: `) + x : x))
      .join('\n');
  }

  public static processLogMessage(options: ILogMessageCallbackOptions, terminal: ITerminal): void {
    const message: string = options.message;
    const details: LogMessageDetails = options.details;

    // Special formatting for interested messages
    switch (details.messageIdentifier) {
      case LogMessageIdentifier.PREPARE_FINISHING:
        terminal.writeVerboseLine(
          PnpmSyncUtilities._addLinePrefix(
            `Regenerated .pnpm-sync.json in ${Math.round(details.executionTimeInMs)} ms`
          )
        );
        return;

      case LogMessageIdentifier.COPY_FINISHING:
        {
          const customMessage: string =
            `Synced ${details.fileCount} ` +
            (details.fileCount === 1 ? 'file' : 'files') +
            ` in ${Math.round(details.executionTimeInMs)} ms`;

          terminal.writeVerboseLine(PnpmSyncUtilities._addLinePrefix(customMessage));
        }
        return;

      case LogMessageIdentifier.PREPARE_REPLACING_FILE:
        {
          const customMessage: string =
            `Expected .pnpm-sync.json version: ${details.expectedVersion}; ` +
            `actual .pnpm-sync.json version: ${details.actualVersion}; `;

          terminal.writeVerboseLine(PnpmSyncUtilities._addLinePrefix(message));
          terminal.writeVerboseLine(PnpmSyncUtilities._addLinePrefix(customMessage));
        }
        return;

      // don't return this error case, pass to default handler
      case LogMessageIdentifier.COPY_ERROR_INCOMPATIBLE_SYNC_FILE: {
        const customMessage: string =
          `Expected .pnpm-sync.json version: ${details.expectedVersion}; ` +
          `actual .pnpm-sync.json version: ${details.actualVersion}; `;

        terminal.writeErrorLine(PnpmSyncUtilities._addLinePrefix(customMessage));
      }
    }

    // Default handling for other messages
    switch (options.messageKind) {
      case LogMessageKind.ERROR:
        terminal.writeErrorLine(Colorize.red('ERROR: pnpm-sync: ' + message));
        throw new AlreadyReportedError();

      case LogMessageKind.WARNING:
        terminal.writeWarningLine(Colorize.yellow('pnpm-sync: ' + message));
        return;

      case LogMessageKind.INFO:
      case LogMessageKind.VERBOSE:
        terminal.writeDebugLine(PnpmSyncUtilities._addLinePrefix(message));
        return;
    }
  }
}
