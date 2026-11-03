// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { WorkspaceFileManager } from './lib/fileManager/workspace';
import { Execute } from './executor/execute';
import DatabaseSql from './config';
import EmbeddingService from './lib/embeddings';
import ProjectContext from './lib/projectContext';
import ReceiveMessage from './receiveMessage';
import ActionService from './action';
import { ModelService } from './model';
import { GoogleAgent } from './agent/google';


export async function activate(context: vscode.ExtensionContext) {
    const fileManager = new WorkspaceFileManager();
    const projectContext = new ProjectContext();
    const execute = new Execute(fileManager, projectContext);
    const database = new DatabaseSql();
    const modelService = new ModelService(context.globalStorageUri);

    // Inisialisasi Database LanceDB dengan Progress Window
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Window,
            title: "Init database lancedb...",
        },
        async () => {
            try {
                await database.init(context);
                await database.clearEmbeddingsTable();
            } catch (err) {
                console.error("Gagal menginisialisasi database:", err);
            }
        }
    );

    // Inisialisasi Action & UI Services
    const embedding = new EmbeddingService();
    const receiveMessage = new ReceiveMessage();

    const actionService = new ActionService(
        receiveMessage,
        execute,
        projectContext,
        database,
        embedding
    );

    const sidebarView = new SidebarProvider(
        context.extensionUri,
        actionService,
        modelService,
        receiveMessage
    );

    const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
        if (document.uri.scheme !== 'file' || document.fileName.includes('node_modules')) {
            return;
        }

        const uri = document.uri
        const filePath = uri.fsPath;

        console.log(`File diubah & disimpan: ${filePath}`);
        await actionService.emebddingFile(uri).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);

            vscode.window.showErrorMessage(`Gagal memproses embedding: ${message}`);

            console.error('Embedding error:', err);
        });
    });

    const onDeleteDisposable = vscode.workspace.onDidDeleteFiles(async (event) => {
        for (const fileUri of event.files) {
            await actionService.removeFromFileIndex(fileUri).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);

                vscode.window.showErrorMessage(`Gagal memproses embedding: ${message}`);

                console.error('Embedding error:', err);
            });
        }
    });

    const onRenameDisposable = vscode.workspace.onDidRenameFiles(async (event) => {
        for (const file of event.files) {
            await actionService.removeFromFileIndex(file.oldUri).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);

                vscode.window.showErrorMessage(`Gagal memproses embedding: ${message}`);

                console.error('Embedding error:', err);
            });
        }
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("chatSidebarView", sidebarView),
        onDeleteDisposable,
        onRenameDisposable,
        onSaveDisposable
    );
}

// This method is called when your extension is deactivated
export function deactivate() { }
