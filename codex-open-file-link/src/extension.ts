import * as path from 'path';
import * as vscode from 'vscode';

type ParsedReference = {
  raw: string;
  filePath: string;
  line: number;
  column: number;
};

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'codexOpenFileLink.openReference',
    async () => {
      try {
        const input = await getInputText();
        if (!input) {
          void vscode.window.showWarningMessage(
            'Нет выделения, и буфер обмена пуст.'
          );
          return;
        }

        const parsed = parseReference(input);
        if (!parsed) {
          void vscode.window.showWarningMessage(
            `Не смог распознать ссылку на файл: ${truncate(input, 160)}`
          );
          return;
        }

        const fileUri = await resolveFileUri(parsed.filePath);

        if (!fileUri) {
          void vscode.window.showErrorMessage(
            `Файл не найден в workspace: ${parsed.filePath}`
          );
          return;
        }

        await openFileAtPosition(fileUri, parsed.line, parsed.column);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Неизвестная ошибка';
        void vscode.window.showErrorMessage(`Codex Open File Link: ${message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}

async function getInputText(): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    const selected = editor.document.getText(editor.selection).trim();
    if (selected) {
      return selected;
    }

    const lineText = editor.document.lineAt(editor.selection.active.line).text.trim();
    if (lineText) {
      return lineText;
    }
  }

  const clipboard = (await vscode.env.clipboard.readText()).trim();
  return clipboard || undefined;
}

/*function parseReference(input: string): ParsedReference | null {
  const text = cleanupInput(input);

  // Search within the full string instead of matching the whole line.
  const match =
    text.match(/([^\s"'`()\[\]<>]+?\.[a-zA-Z0-9]+)#L(\d+)/) ||
    text.match(/([^\s"'`()\[\]<>]+?\.[a-zA-Z0-9]+):(\d+):(\d+)/) ||
    text.match(/([^\s"'`()\[\]<>]+?\.[a-zA-Z0-9]+):(\d+)/);

  if (!match) return null;

  const filePath = normalizePossiblePath(match[1]);
  const line = Number(match[2]) || 1;
  const column = Number(match[3]) || 1;

  return {
    raw: input,
    filePath,
    line,
    column
  };
}*/

function parseReference(input: string): ParsedReference | null {
  const text = input;

  // Ищем ВСЕ возможные совпадения в тексте
  const patterns: RegExp[] = [
    /([a-zA-Z0-9_\-/\.]+?\.[a-zA-Z0-9]+)#L(\d+)/g,
    /([a-zA-Z0-9_\-/\.]+?\.[a-zA-Z0-9]+):(\d+):(\d+)/g,
    /([a-zA-Z0-9_\-/\.]+?\.[a-zA-Z0-9]+):(\d+)/g
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const filePath = normalizePossiblePath(match[1]);
      const line = Number(match[2]) || 1;
      const column = Number(match[3]) || 1;

      return {
        raw: input,
        filePath,
        line,
        column
      };
    }
  }

  return null;
}

/*function parseReference(input: string): ParsedReference | null {
  const text = cleanupInput(input);

  const patterns: RegExp[] = [
    // runtime.service.ts#L2388
    /(?<file>[^\s"'`()\[\]<>]+?)#L(?<line>\d+)(?::(?<column>\d+))?/i,

    // runtime.service.ts:2388:1
    /(?<file>[^\s"'`()\[\]<>]+?\.[A-Za-z0-9]+):(?<line>\d+):(?<column>\d+)/,

    // runtime.service.ts:2388
    /(?<file>[^\s"'`()\[\]<>]+?\.[A-Za-z0-9]+):(?<line>\d+)/,

    // .../runtime.service.ts line 2388
    /(?<file>[^\s"'`()\[\]<>]+?\.[A-Za-z0-9]+)[,\s]+line\s+(?<line>\d+)(?:[,\s]+col(?:umn)?\s+(?<column>\d+))?/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.groups?.file || !match.groups.line) {
      continue;
    }

    const filePath = normalizePossiblePath(match.groups.file);
    const line = Math.max(1, Number(match.groups.line));
    const column = Math.max(1, Number(match.groups.column ?? '1'));

    if (!Number.isFinite(line) || !Number.isFinite(column)) {
      continue;
    }

    return {
      raw: input,
      filePath,
      line,
      column
    };
  }

  return null;
}*/

function cleanupInput(input: string): string {
  return input
    .replace(/\u200B/g, '')
    .replace(/^['"`]+|['"`]+$/g, '')
    .trim();
}

function normalizePossiblePath(filePath: string): string {
  let result = filePath.trim();

  // Убираем хвосты вида ).
  result = result.replace(/[),.;]+$/, '');

  // file:///C:/...
  if (result.startsWith('file:///')) {
    result = decodeURIComponent(result.replace('file:///', ''));
  }

  // vscode://file/C:/...
  const vscodeFilePrefix = 'vscode://file/';
  if (result.startsWith(vscodeFilePrefix)) {
    result = decodeURIComponent(result.slice(vscodeFilePrefix.length));
  }

  // Windows-style slash normalization
  result = result.replace(/\\/g, '/');

  return result;
}

async function resolveFileUri(filePath: string): Promise<vscode.Uri | null> {
  // 1. Абсолютный путь
  if (path.isAbsolute(filePath) || /^[A-Za-z]:\//.test(filePath)) {
    return vscode.Uri.file(filePath);
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  // 2. Прямое соединение с root
  for (const folder of workspaceFolders) {
    const candidate = vscode.Uri.joinPath(folder.uri, ...filePath.split('/'));
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      // ignore
    }
  }

  // 3. Поиск по точному относительному пути
  const exactMatches = await vscode.workspace.findFiles(
    `**/${filePath}`,
    '**/node_modules/**',
    20
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    return await pickUri(exactMatches, filePath);
  }

  // 4. Поиск по basename
  const baseName = path.posix.basename(filePath);
  const baseMatches = await vscode.workspace.findFiles(
    `**/${baseName}`,
    '**/node_modules/**',
    100
  );

  if (baseMatches.length === 0) {
    return null;
  }

  if (baseMatches.length === 1) {
    return baseMatches[0];
  }

  // 5. Попробуем выбрать наиболее похожий путь
  const scored = baseMatches
    .map((uri) => ({
      uri,
      score: similarityScore(uri.fsPath.replace(/\\/g, '/'), filePath)
    }))
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  const best = scored.filter((x) => x.score === topScore).map((x) => x.uri);

  if (best.length === 1) {
    return best[0];
  }

  return await pickUri(best, filePath);
}

async function pickUri(uris: vscode.Uri[], original: string): Promise<vscode.Uri | null> {
  const picks = uris.map((uri) => ({
    label: vscode.workspace.asRelativePath(uri),
    description: uri.fsPath,
    uri
  }));

  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: `Найдено несколько файлов для "${original}". Выбери нужный`
  });

  return selected?.uri ?? null;
}

function similarityScore(candidate: string, query: string): number {
  const c = candidate.toLowerCase();
  const q = query.toLowerCase();

  if (c.endsWith(q)) return 1000;
  if (c.includes(q)) return 500;

  const qParts = q.split('/').filter(Boolean);
  let score = 0;

  for (const part of qParts) {
    if (c.includes(part)) {
      score += 10;
    }
  }

  return score;
}

async function openFileAtPosition(
  uri: vscode.Uri,
  line: number,
  column: number
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, {
    preview: false
  });

  const zeroBasedLine = Math.max(0, line - 1);
  const zeroBasedColumn = Math.max(0, column - 1);

  const safeLine = Math.min(zeroBasedLine, Math.max(0, document.lineCount - 1));
  const safeColumn = Math.min(
    zeroBasedColumn,
    document.lineAt(safeLine).text.length
  );

  const position = new vscode.Position(safeLine, safeColumn);
  const selection = new vscode.Selection(position, position);

  editor.selection = selection;
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenter
  );
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 1) + '...';
}
