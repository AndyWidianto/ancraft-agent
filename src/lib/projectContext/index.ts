import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import DatabaseSql from '../../config';
import EmbeddingService from '../embeddings';
import { AgentAI, OperationResult, ResponseDocument, TaskHistory } from '../types';
import { DocumentationResult } from '../types/documentation';

export default class ProjectContext {
    private async resolveRoot(providedRoot?: string): Promise<string> {
        let resolved = providedRoot ? path.resolve(providedRoot) : '';

        if (!resolved || !fs.existsSync(path.join(resolved, 'package.json'))) {
            const manifestPattern = '{**/package.json,**/composer.json,**/pyproject.toml,**/requirements.txt,**/go.mod,**/Cargo.toml}';

            // Exclude semua folder build frontend (.next, .nuxt, dist, out, build, dll) & dependency
            const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/.next/**,**/.nuxt/**,**/.output/**,**/.svelte-kit/**,**/coverage/**}';

            const foundFiles = await vscode.workspace.findFiles(manifestPattern, excludePattern, 1);
            if (foundFiles.length > 0) {
                resolved = path.dirname(foundFiles[0].fsPath);
            } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                resolved = vscode.workspace.workspaceFolders[0].uri.fsPath;
            } else {
                resolved = process.cwd();
            }
        }
        return resolved;
    }

    async getProjectStructure(reason: string, providedRoot?: string, needWorkspace: boolean = false): Promise<string> {
        const rootPath = await this.resolveRoot(providedRoot);
        const dependencyContext = await this.getDependencyInfo(reason, rootPath);

        const files = await vscode.workspace.findFiles(
            '**/*',
            '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/.next/**,**/.nuxt/**,**/.output/**,**/.svelte-kit/**,**/target/**,**/vendor/**,**/bin/**,**/obj/**,**/.gradle/**,**/.mvn/**,**/__pycache/**,**/.pytest_cache/**,**/.venv/**,**/venv/**,**/.claude/**,**/.agents/**,**/.windsurf/**,**/.turbo/**,**/.cache/**}',
            100
        );

        let context = `${dependencyContext}\n\n`;

        if (needWorkspace) {
            const fileList = files.map(f => vscode.workspace.asRelativePath(f)).join('\n');
            context += `--- Workspace File Tree ---\n${fileList}\n`;
        }

        return context;
    }

    async getWorkspaceTree() {
        const files = await vscode.workspace.findFiles(
            '**/*',
            '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/out/**,**/.next/**,**/.nuxt/**,**/.output/**,**/.svelte-kit/**,**/target/**,**/vendor/**,**/bin/**,**/obj/**,**/.gradle/**,**/.mvn/**,**/__pycache/**,**/.pytest_cache/**,**/.venv/**,**/venv/**,**/.claude/**,**/.agents/**,**/.windsurf/**,**/.turbo/**,**/.cache/**}',
            100
        );

        const fileList = files.map(f => vscode.workspace.asRelativePath(f)).join('\n');
        let context = `\n${fileList}\n`;
        return context;
    }

    async getSemanticSearch(agent: AgentAI, model: string, query: string, reason: string, database: DatabaseSql, path: string): Promise<ResponseDocument> {
        try {
            let isNotfound = false;
            let text = '';
            const embedQuery = await agent.embedding(query, model);
            const searchResults = await database.searchEmbeddings(embedQuery, 10, path);

            console.log("Result semantic Search: ", searchResults);

            const topResults = Array.isArray(searchResults) ? searchResults.slice(0, 5) : []

            const formattedResults = topResults.map((res: any, idx: number) => {
                const filePath = res.path || res.file_path || 'Unknown';
                const distance = res._distance !== undefined ? res._distance.toFixed(3) : 'N/A';

                return `[Result #${idx + 1}] File: ${filePath} (Distance: ${distance})\nContent:\n${res.content}`;
            }).join('\n\n---\n\n');

            return {
                text: `=== SEMANTIC SEARCH RESULTS ===\n` +
                    `Query: "${query}"\n` +
                    `Reason: ${reason}\n\n` +
                    `${formattedResults || 'No relevant vector match found.'}\n`,
                isNotFound: topResults.length > 0 ? false : true
            };
        } catch (err) {
            console.error(err);
            throw err;
        }
    }


    async getFileContent(agent: AgentAI, model: string, database: DatabaseSql, embedding: EmbeddingService, filePath: string, query: string, reason: string): Promise<ResponseDocument> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return {
                    text: `[Error reading file ${filePath}: No active workspace]`,
                    isNotFound: true
                }
            }

            const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
            const normalizedPath = fileUri.path.replace(/\\/g, '/');

            let embeddings = await database.getEmbeddingsByPath(normalizedPath);

            if (embeddings.length === 0) {
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const content = Buffer.from(fileData).toString('utf-8');

                if (!content.trim()) {
                    return {
                        text: `=== FILE: ${filePath} ===\nReason: ${reason}\n\n[File is empty]\n`,
                        isNotFound: true
                    }
                }

                const generatedEmbeddings = await embedding.embeddings(agent, model, content, normalizedPath);

                if (!generatedEmbeddings) {
                    throw new Error("Layanan embedding gagal menghasilkan data (mengembalikan undefined)");
                }

                await database.saveEmbeddings(generatedEmbeddings);
                embeddings = generatedEmbeddings;
            }

            let targetChunks: any[] = [];

            if (!query || query.trim() === '') {
                // Ambil beberapa chunk awal, pastikan hanya mengambil properti start, end, dan content
                targetChunks = embeddings.slice(0, 5).map(item => ({
                    start: item.start,
                    end: item.end,
                    content: item.content
                }));
            } else {
                const embedQuery = await embedding.embedding(agent, query, model);
                const searchQuery = await database.searchEmbeddings(embedQuery, 3, normalizedPath);

                targetChunks = searchQuery.map((search: any) => ({
                    start: search.start_line,
                    end: search.end_line,
                    content: search.content
                }));
            }

            targetChunks.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

            // Format string yang bersih dan sederhana untuk Agent
            const formattedContent = targetChunks
                .map(item => JSON.stringify(item))
                .join('\n\n');

            return {
                text: `=== FILE: ${filePath} ===\n` +
                    `Reason: ${reason}\n\n` +
                    `${formattedContent || '[No relevant file content found]'}\n`,
                isNotFound: false
            };

        } catch (err) {
            console.error("Error File Content: ", err);
            throw err;
        }
    }

    async getFullFileContent(filePath: string, reason: string): Promise<ResponseDocument> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return {
                    text: `[Error reading file ${filePath}: No active workspace]`,
                    isNotFound: true
                }
            }

            const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);

            const fileData = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(fileData).toString('utf-8');

            if (!content.trim()) {
                return {
                    text: `=== FILE CONTENT: ${filePath} ===\nReason:${reason}\n\n[File is empty]\n`,
                    isNotFound: true
                };
            }


            return {
                isNotFound: false,
                text: `=== FILE CONTENT: ${filePath} ===\n` +
                    `Reason: ${reason}\n\n` +
                    `${content}\n`
            };

        } catch (err) {
            console.error("Error File Content: ", err);
            throw err;
        }
    }

    async getSymbolSearch(query: string, reason: string): Promise<ResponseDocument> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider',
                query
            );

            const formattedSymbols = (symbols || []).slice(0, 10).map(sym =>
                `- ${sym.name} (${vscode.SymbolKind[sym.kind]}) in ${vscode.workspace.asRelativePath(sym.location.uri)} [Line ${sym.location.range.start.line + 1}]`
            ).join('\n');

            return {
                text: `=== SYMBOL SEARCH RESULTS ===\n` +
                    `Query: "${query}"\n` +
                    `Reason: ${reason}\n\n` +
                    `${formattedSymbols || 'No matching symbols found.'}\n`,
                isNotFound: false
            };
        } catch (err) {
            throw err;
        }
    }

    async getDependencyInfo(reason: string, providedRoot?: string): Promise<string> {
        const resolvedRoot = await this.resolveRoot(providedRoot);

        const manifestFiles = [
            'package.json',
            'composer.json',
            'pyproject.toml',
            'requirements.txt',
            'go.mod',
            'Cargo.toml'
        ];

        const lockfiles = [
            'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
            'bun.lockb', 'composer.lock', 'poetry.lock', 'Cargo.lock'
        ];

        const foundManifests = manifestFiles.filter(file =>
            fs.existsSync(path.join(resolvedRoot, file))
        );

        const detectedLockfiles = lockfiles.filter(file =>
            fs.existsSync(path.join(resolvedRoot, file))
        );

        let contextOutput = `=== DEPENDENCY & MANIFEST INFO ===\n`;
        contextOutput += `Reason: ${reason}\n`;
        contextOutput += `Root: "${resolvedRoot}"\n`;
        contextOutput += `Lockfiles: ${detectedLockfiles.length > 0 ? detectedLockfiles.join(', ') : 'None'}\n`;

        if (foundManifests.length === 0) {
            contextOutput += `\n[No package manifest files found in root]\n`;
            return contextOutput;
        }

        for (const manifest of foundManifests) {
            const manifestPath = path.join(resolvedRoot, manifest);
            try {
                const content = fs.readFileSync(manifestPath, 'utf-8');

                if (manifest.endsWith('.json')) {
                    const parsed = JSON.parse(content);
                    const sanitized = {
                        name: parsed.name || path.basename(resolvedRoot),
                        dependencies: parsed.dependencies || {},
                        devDependencies: parsed.devDependencies || {},
                        scripts: parsed.scripts || {},
                    };
                    contextOutput += `\n--- ${manifest} ---\n` + JSON.stringify(sanitized, null, 2) + '\n';
                } else {
                    contextOutput += `\n--- ${manifest} ---\n${content.trim()}\n`;
                }
            } catch (err) {
                contextOutput += `\n[Error reading ${manifest}: ${(err as Error).message}]\n`;
            }
        }

        return contextOutput;
    }

    buildExecutionHistoryContext(history: OperationResult[], maxRecentOps = 5): string {
        if (!history?.length) {
            return `=== RECENT EXECUTION HISTORY ===\nNo operations executed yet.`;
        }

        // Ambil N operasi terbaru
        const recentOps = history.slice(-maxRecentOps);

        const formattedHistory = recentOps.map((op) =>
            `- [${op.status}] ${op.summary}${op.error ? ` (Error: ${op.error})` : ''}`
        ).join('\n');

        return `=== RECENT EXECUTION HISTORY (Last ${recentOps.length} operations) ===\n${formattedHistory}`;
    }

    async saveDocumentation(documentation: DocumentationResult) {

    }

}