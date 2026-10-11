import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { CommandResult, FileOperationResult } from '../types';

const execAsync = promisify(exec);

export class WorkspaceFileManager {
    private agentTerminal: vscode.Terminal | undefined;

    async createFile(filePath: string, content: string): Promise<FileOperationResult> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return {
                    success: false,
                    message: "Gagal membuat file: Tidak ada workspace folder yang sedang terbuka."
                };
            }

            // Gabungkan path relatif dengan root workspace
            const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);

            // Encode string content ke Uint8Array menggunakan Buffer
            const contentBuffer = Buffer.from(content, 'utf8');

            // Buat file dan tulis isinya (akan membuat folder secara otomatis jika belum ada)
            await vscode.workspace.fs.writeFile(fileUri, contentBuffer);

            vscode.window.showInformationMessage(`File berhasil dibuat: ${filePath}`);

            return {
                success: true,
                message: `File berhasil dibuat: ${filePath}`
            };
        } catch (error: any) {
            const errorMessage = `Gagal membuat file ${filePath}: ${error.message}`;
            vscode.window.showErrorMessage(errorMessage);

            return {
                success: false,
                message: errorMessage
            };
        }
    }

    /**
     * Menghapus file dari workspace
     */
    async deleteFile(filePath: string): Promise<FileOperationResult> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return {
                    success: false,
                    message: "Gagal menghapus file: Tidak ada workspace folder yang sedang terbuka."
                };
            }

            const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);

            // Opsi useTrash: true memindahkan file ke Trash/Recycle Bin (lebih aman dibanding hapus permanen)
            await vscode.workspace.fs.delete(fileUri, { recursive: false, useTrash: true });

            vscode.window.showInformationMessage(`File berhasil dihapus: ${filePath}`);

            return {
                success: true,
                message: `File berhasil dihapus: ${filePath}`
            };
        } catch (error: any) {
            const errorMessage = `Gagal menghapus file ${filePath}: ${error.message}`;
            vscode.window.showErrorMessage(errorMessage);

            return {
                success: false,
                message: errorMessage
            };
        }
    }

    /**
     * Mengubah/mengganti teks spesifik di dalam file menggunakan WorkspaceEdit
     */
    async modifyFile(filePath: string, search: string, replace: string): Promise<FileOperationResult> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return {
                    success: false,
                    message: "Gagal mengubah file: Tidak ada workspace folder yang terbuka."
                };
            }

            const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
            const document = await vscode.workspace.openTextDocument(fileUri);
            const fullText = document.getText();

            const normalizedFullText = fullText.replace(/\r\n/g, '\n');
            const normalizedSearch = search.replace(/\r\n/g, '\n');
            const normalizedReplace = replace.replace(/\r\n/g, '\n');

            let searchIndex = normalizedFullText.indexOf(normalizedSearch);
            let actualSearchLength = normalizedSearch.length;

            if (searchIndex === -1) {
                const trimmedSearch = normalizedSearch.trim();
                searchIndex = normalizedFullText.indexOf(trimmedSearch);
                if (searchIndex !== -1) {
                    actualSearchLength = trimmedSearch.length;
                }
            }

            // Jika tetap tidak ketemu, kembalikan pesan error detail ke Agent tanpa throw!
            if (searchIndex === -1) {
                return {
                    success: false,
                    message: `Gagal mengubah file ${filePath}: Teks yang dicari ("${search.substring(0, 40).replace(/\n/g, ' ')}...") tidak ditemukan. Pastikan kamu telah membaca isi file via FILE_CONTENT terlebih dahulu.`
                };
            }

            const startPosition = document.positionAt(searchIndex);
            const endPosition = document.positionAt(searchIndex + actualSearchLength);
            const replaceRange = new vscode.Range(startPosition, endPosition);

            const edit = new vscode.WorkspaceEdit();
            edit.replace(fileUri, replaceRange, normalizedReplace);

            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                await document.save();
                return {
                    success: true,
                    message: `Berhasil memperbarui file: ${filePath}`
                };
            } else {
                return {
                    success: false,
                    message: `Gagal menerapkan perubahan WorkspaceEdit pada file ${filePath}.`
                };
            }
        } catch (error: any) {
            // Return object error tanpa melakukan throw
            return {
                success: false,
                message: `Error saat memproses ${filePath}: ${error.message}`
            };
        }
    }

    async runCommand(command: string, cwd?: string): Promise<CommandResult> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            return {
                success: false,
                stdout: '',
                stderr: '',
                message: 'Tidak ada workspace folder yang terbuka.'
            };
        }

        const executionCwd = cwd ? path.resolve(workspaceFolder, cwd) : workspaceFolder;
        const isWindows = process.platform === 'win32';

        // Jika di Linux/Mac, bungkus command agar dijalankan via bash interactive/login shell
        // Ini akan memaksa ~/.bashrc dimuat sehingga npx/npm/node terdeteksi!
        const finalCommand = isWindows
            ? command
            : `/bin/bash -ic "${command.replace(/"/g, '\\"')}"`;

        return new Promise((resolve) => {
            exec(
                finalCommand,
                { cwd: executionCwd },
                (error, stdout, stderr) => {
                    if (error) {
                        resolve({
                            success: false,
                            stdout: stdout.trim(),
                            stderr: stderr.trim(),
                            message: error.message
                        });
                    } else {
                        resolve({
                            success: true,
                            stdout: stdout.trim(),
                            stderr: stderr.trim(),
                            message: "Command berhasil dieksekusi"
                        });
                    }
                }
            );
        });
    }

    async runCommandInTerminal(command: string, cwd?: string): Promise<boolean> {
        return new Promise((resolve) => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const executionCwd = cwd ? path.resolve(workspaceFolder || '', cwd) : workspaceFolder;

            const terminal = vscode.window.createTerminal({
                name: cwd || 'Ancraft Installer',
                cwd: executionCwd,
            });

            terminal.show(true); // Tampilkan ke user

            const disposable = vscode.window.onDidCloseTerminal((closedTerminal) => {
                if (closedTerminal === terminal) {
                    disposable.dispose(); // Hapus listener agar tidak memory leak
                    resolve(true); // Lanjut ke step berikutnya!
                }
            });

            terminal.sendText(`${command} && exit`);
        });
    }

    async getWorkspaceTree(
        dirUri?: vscode.Uri,
        maxDepth: number = 3,
        currentDepth: number = 0
    ): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return 'Tidak ada workspace terbuka.';
        }

        const rootUri = workspaceFolders[0].uri;
        const currentDir = dirUri || rootUri;

        if (currentDepth >= maxDepth) {
            return '';
        }

        // List folder/file/ekstensi raksasa yang diabaikan total
        const ignoredNames = new Set([
            // IDE & System
            '.git', '.svn', '.hg', '.vscode', '.idea', '.DS_Store', 'Thumbs.db',
            // Node / JS / Frameworks
            'node_modules', '.next', '.nuxt', '.output', '.svelte-kit', '.turbo',
            'dist', 'build', 'out', 'coverage', '.cache', '.npm', '.yarn',
            'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
            // PHP / Python / Go / Rust / Mobile
            'vendor', 'storage', 'bootstrap/cache', '__pycache__', '.venv', 'venv',
            'target', '.gradle', '.dart_tool', 'Pods', 'DerivedData',
            // Logs & Media Berat
            'logs', 'tmp', 'temp', '.nyc_output'
        ]);

        const pathsList: string[] = [];

        try {
            const entries = await vscode.workspace.fs.readDirectory(currentDir);

            // Filter & Sortir (Folder di atas, File di bawah)
            const filteredEntries = entries
                .filter(([name]) => !ignoredNames.has(name) && !name.endsWith('.log'))
                .sort((a, b) => (a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] === vscode.FileType.Directory ? -1 : 1));

            for (const [name, type] of filteredEntries) {
                const isDirectory = type === vscode.FileType.Directory;
                const childUri = vscode.Uri.joinPath(currentDir, name);

                // Ambil path relatif terhadap root workspace (Hemat token!)
                const relativePath = path.relative(rootUri.fsPath, childUri.fsPath);

                if (isDirectory) {
                    pathsList.push(`${relativePath}/`);
                    if (currentDepth + 1 < maxDepth) {
                        const subTree = await this.getWorkspaceTree(childUri, maxDepth, currentDepth + 1);
                        if (subTree) {
                            pathsList.push(subTree);
                        }
                    }
                } else {
                    pathsList.push(relativePath);
                }
            }
        } catch (error) {
            // Abaikan folder tanpa izin
        }

        return pathsList.join('\n');
    }
}