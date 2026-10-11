// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { WorkspaceFileManager } from './lib/file_manager/workspace';
import { Execute } from './lib/execute';
import DatabaseSql from './config';
import EmbeddingService from './lib/embeddings';
import ProjectContext from './lib/projectContext';
import { AgentAI, AIProviderEnum } from './lib/types';
import ReceiveMessage from './receiveMessage';
import ActionService from './action';
import { ModelService } from './model';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	const fileManager = new WorkspaceFileManager();
	const projectContext = new ProjectContext();
	const execute = new Execute(fileManager, projectContext);
	const database = new DatabaseSql();
	const embedding = new EmbeddingService();
	const receiveMessage = new ReceiveMessage();
	const actionService = new ActionService(
		receiveMessage,
		execute,
		projectContext,
		database,
		embedding,
	);
	const modelService = new ModelService(context.globalStorageUri);
	const sidebarView = new SidebarProvider(
		context.extensionUri,
		actionService,
		modelService,
		receiveMessage
	);

	await database.init(context).catch((err) => console.log("Error: ", err));

	// vscode.window.withProgress({
	// 	location: vscode.ProgressLocation.Window,
	// 	title: "Indexing workspace code..."
	// }, async () => {
	// 	// const getConfig = await database.getAgentConfig("EMBEDDING");
	// 	// if (!getConfig) return;
	// 	const { agentExecutor } = await sidebarView.connectedProvider("GEMINI", "GEMINI");
	// 	await emebddingFiles(agentExecutor, embedding, database);
	// });
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("chatSidebarView", sidebarView)
	);
}

async function emebddingFiles(agent: AgentAI, embedding: EmbeddingService, database: DatabaseSql) {
	const includePattern =
		"**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte,php,prisma,sql,py,go,java,kt,kts,cs,rb,rs,json,yaml,yml,toml,xml,graphql,gql,html,css,scss,sass,less,md}";

	const excludePattern =
		"**/{node_modules,vendor,dist,build,.next,.nuxt,coverage,.git,storage/framework,bootstrap/cache}/**";

	const files = await vscode.workspace.findFiles(
		includePattern,
		excludePattern
	);
	for (const uri of files) {
		let document: vscode.TextDocument;

		try {
			document = await vscode.workspace.openTextDocument(uri);
		} catch {
			continue;
		}

		const text = document.getText();
		if (!text.trim()) {
			continue;
		}
		const findPath = await database.getEmbeddingsByPath(uri.path);
		if (findPath) {
			console.log("Context: ", findPath);
			return;
		}
		const vectors = await embedding.embeddings(agent, text, uri.path);
		await database.saveEmbeddings(vectors);
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
