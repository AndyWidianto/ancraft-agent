// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { WorkspaceFileManager } from './lib/file_manager/workspace';
import { Execute } from './lib/execute';
import DatabaseSql from './config';
import EmbeddingService from './lib/embeddings';
import ProjectContext from './lib/projectContext';
import ReceiveMessage from './receiveMessage';
import ActionService from './action';
import { ModelService } from './model';
import { GoogleAgent } from './agent/google';


export async function activate(context: vscode.ExtensionContext) {
    const embeddingValid = new Map<"EmbeddingValid", boolean>();

    // 1. Inisialisasi Core Services
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

    // Daftarkan Webview Provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("chatSidebarView", sidebarView)
    );
}

// This method is called when your extension is deactivated
export function deactivate() { }
