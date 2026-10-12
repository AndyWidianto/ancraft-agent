import { GoogleAgent } from "../agent/google";
import OpenAIService from "../agent/openai";
import type { AgentAI, ExecuteOperationMessage, ExecuteStepMessage, ExecuteTaskMessage, ExecuteTaskResult, Operation, OperationError, SearchRelevantCode, StatusTask, TextMessage, TypeProvider } from "../lib/types";
import vscode from "vscode";
import ReceiveMessage from "../receiveMessage";
import { Execute } from "../lib/execute";
import ProjectContext from "../lib/projectContext";
import { v4 as uuid } from "uuid";
import DatabaseSql from "../config";
import EmbeddingService from "../lib/embeddings";
import { ModelService } from "../model";
import AnthropicAgent from "../agent/anthreopic";



export default class ActionService {
    constructor(
        private readonly receiveMessage: ReceiveMessage,
        private readonly execute: Execute,
        private readonly projectContext: ProjectContext,
        private readonly database: DatabaseSql,
        private readonly embedding: EmbeddingService,
    ) { }

    async connectedProvider({
        provider,
        apikey,
    }: { provider: "GEMINI" | "OPENAI" | "ANTHROPIC", apikey: string }) {
        let agent: AgentAI;
        switch (provider) {
            case "GEMINI": {
                agent = await GoogleAgent.create({ apiKey: apikey });
                break;
            }
            case "OPENAI": {
                agent = new OpenAIService(apikey);
                break;
            }
            case "ANTHROPIC": {
                agent = new AnthropicAgent(apikey);
                break;
            }
        }
        return agent;
    }

    async deleteEmbeddings() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Tidak ada workspace yang sedang terbuka!');
            return;
        }

        const rootUri = workspaceFolders[0].uri;

        await this.database.deleteEmbeddingsByPath(`${rootUri.path}/*`);
    }

    async createExtensionFile(filePath: string, content: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Tidak ada workspace yang sedang terbuka!');
            return;
        }

        const rootUri = workspaceFolders[0].uri;
        const fileUri = vscode.Uri.joinPath(rootUri, filePath);

        const encoder = new TextEncoder();
        const fileData = encoder.encode(content);

        try {
            await vscode.workspace.fs.writeFile(fileUri, fileData);

            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);

            vscode.window.showInformationMessage(`File ${filePath} berhasil dibuat!`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Gagal membuat file: ${error.message}`);
        }
    }

    async readModels(webviewView: vscode.WebviewView, modelService: ModelService) {
        for (const item of ['.gemini.json', '.openai.json', '.claude.json']) {
            const models = await modelService.readModelConfig(item);
            if (models) {
                console.log(models);
                this.receiveMessage.receiveModels(webviewView, models, "READ");
            }
        }
    }

    async saveModels(modelService: ModelService, provider: TypeProvider, data: any) {
        const filename = provider === "OPENAI"
            ? `.openai.json`
            : provider === "GEMINI"
                ? '.gemini.json'
                : '.claude.json';

        // Coba simpan ke file
        try {
            await modelService.saveModelConfig(filename, data);
        } catch (fileErr) {
            console.error(`Gagal menyimpan file ${filename}:`, fileErr);
        }
    }
    async getModels(provider: TypeProvider, apikey: string, webviewView: vscode.WebviewView, modelService: ModelService) {
        try {
            const agent = await this.connectedProvider({ provider, apikey });
            const models = await agent.getModels();

            const data = {
                provider,
                apikey,
                models
            };

            await this.saveModels(modelService, provider, data);

            // Kirim tetap berjalan ke UI Webview
            this.receiveMessage.receiveModels(webviewView, {
                provider,
                apikey,
                models
            }, "CREATE");
        } catch (err) {
            console.error("Gagal mengambil model:", err);
        }
    }

    async getPlanning(webviewView: vscode.WebviewView, data: TextMessage, signal?: AbortSignal) {
        const agent = await this.connectedProvider({
            provider: data.meta.provider,
            apikey: data.meta.apikey
        });
        //const analisis = await this.execute.getAnalisisTeckStack(agent, data.data.text, data.meta.model, signal);
        const projectContext = await this.execute.getProjectContext(true, "");
        const planning = await this.execute.getPlanning(agent, data.meta.model, data.data.text, projectContext, signal);

        const planningId = uuid();
        this.receiveMessage.receivePlanning(webviewView, { ...planning, id: planningId, status: "IN_PROGRESS" });
    }

    async executeStep(webviewView: vscode.WebviewView, message: ExecuteStepMessage, signal?: AbortSignal) {
        const agent = await this.connectedProvider({
            provider: message.meta.provider,
            apikey: message.meta.apikey
        });
        const item = message.data;
        console.log("Step Palnning: ", item.step);

        this.receiveMessage.receiveUpdateStep(webviewView, item.planningId, item.stepId, "IN_PROGRESS");
        const projectContext = await this.execute.getProjectContext(true, "");

        const subPlanning = await this.execute.getSubPlanning(
            agent,
            message.meta.model,
            projectContext,
            item.goal,
            item.step,
            item.previousTasks,
            item.nextTasks,
            signal
        );

        this.receiveMessage.receiveNewTask(webviewView, item.planningId, item.stepId, subPlanning.tasks);
        this.receiveMessage.receiveUpdateStep(webviewView, item.planningId, item.stepId, "DONE");
    }

    async executeTask(webviewView: vscode.WebviewView, message: ExecuteTaskMessage, signal?: AbortSignal) {
        const agent = await this.connectedProvider({
            provider: message.meta.provider,
            apikey: message.meta.apikey
        });

        const item = message.data;
        this.receiveMessage.receiveUpdateTask(webviewView, message.data.planningId, item.stepId, item.taskId, "IN_PROGRESS");

        let projectContext = await this.execute.getProjectContext(true, "");

        const historyTask = this.projectContext.buildExecutionHistoryContext(message.history);

        let accumulatedContext: string[] = [];
        let currentAccumulatedContext = "";
        let historyQuery: string[] = [];
        let refresh = 0;
        let isCompleted = false;
        let responseAgent: ExecuteTaskResult;

        if (message.data.type === "SETUP") {
            isCompleted = true;
        }

        while (!isCompleted && refresh <= 7) {

            const context = await this.execute.searchRelevantCode(
                agent,
                message.meta.model,
                item.task,
                projectContext,
                historyQuery,
                currentAccumulatedContext,
                historyTask
            );

            if (context.status === "NEED_CONTEXT") {
                const newRequests = context.information_requests || [];

                // Filter request untuk memisahkan request baru dan request duplikat
                const duplicateRequests: string[] = [];
                const validRequests = newRequests.filter(req => {
                    const reqKey = req.type === "FILE_CONTENT" ? `${req.path} ${req.query}` : req.reason;

                    if (historyQuery.includes(reqKey)) {
                        duplicateRequests.push(reqKey);
                        return false;
                    }

                    historyQuery.push(reqKey);
                    return true;
                });

                const newContext = await this.handleInformationRequest(
                    agent,
                    { ...context, information_requests: validRequests },
                    this.database,
                    this.embedding
                );

                currentAccumulatedContext = newContext;
                accumulatedContext.push(newContext);
            }

            if (context.status === "READY") {
                isCompleted = true;
            }

            refresh += 1;
        }

        console.log(accumulatedContext.join('\n'));

        if (message.data.type !== "SETUP") {
            responseAgent = await this.execute.Execute(
                agent,
                message.meta.model,
                item.task,
                projectContext,
                accumulatedContext,
                (item.previousTasks ?? []).join('\n'),
                (item.nextTasks ?? []).join('\n'),
                signal
            );
        } else {
            responseAgent = await this.execute.setupProject(agent, message.meta.model, message.data.task, projectContext, signal);
        }
        if (responseAgent.status === "READY" || responseAgent.status === "BLOCKED") {
            const operations = responseAgent.operations.map((operation, index) => ({ ...operation, id: index + 1 }));
            this.receiveMessage.receiveOperations(webviewView, message.data.planningId, item.stepId, item.taskId, operations);
            this.receiveMessage.receiveUpdateTask(webviewView, message.data.planningId, item.stepId, item.taskId, "DONE");
        } else {
            console.error("Gagal menjalankan Task: ", responseAgent);
            console.log(accumulatedContext);
            this.receiveMessage.receiveUpdateTask(webviewView, message.data.planningId, item.stepId, item.taskId, "FAILED");
        }
    }
    async executeOperation(webviewView: vscode.WebviewView, message: ExecuteOperationMessage, signal?: AbortSignal) {

        const item = message.data;
        const operation = item.operation;

        this.receiveMessage.receiveUpdateOperation(
            webviewView,
            message.data.planningId,
            item.stepId,
            item.taskId,
            "IN_PROGRESS",
            operation.id,
            operation,
        );

        const agent = await this.connectedProvider({
            provider: message.meta.provider,
            apikey: message.meta.apikey
        });

        let isSuccess = false;

        try {
            const result = await this.execute.executeResult(operation);
            isSuccess = result.success;

            console.log("Response Operation: ", result);
            // Kirim hasil history
            this.receiveMessage.receiveNewHistory(webviewView, result.operationResult);

            if (!result.success && result.error) {
                console.error("Error", result);
                const projectContext = await this.execute.getProjectContext(true, "");
                await this.errorHandler(webviewView, agent, message.meta.model, item.task, projectContext, result.error, operation);
            }

            // Update embedding jika sukses
            if (isSuccess) {
                await this.updateEmbedding(agent, operation);
            }

        } catch (error) {
            console.error("[ExecuteOperation] Crash/Unhandled Error:", error);
        } finally {
            const finalStatus: StatusTask = isSuccess ? "DONE" : "FAILED";
            setTimeout(() => {
                this.receiveMessage.receiveUpdateOperation(
                    webviewView,
                    message.data.planningId,
                    item.stepId,
                    item.taskId,
                    finalStatus,
                    operation.id,
                    operation,
                );
            }, 500);
        }
    }
    async errorHandler(
        webviewView: vscode.WebviewView,
        agent: any,
        model: string,
        task: string,
        projectContext: string,
        error: OperationError,
        operation: Operation,
        retry = 3,
    ) {
        if (retry <= 0) throw error;

        const contextFailed = operation.type === "COMMAND" ? operation.cwd : `${operation.path}(${operation.type})`;
        let stopProcess = false;
        let refresh = 0;
        let accumulatedContext = "";
        let currentAccumulatedContext = "";
        let historyQuery: string[] = [];

        while (!stopProcess && refresh <= 5) {
            // Panggil Agent
            const responseAgent = await this.execute.analisisError(
                agent,
                model,
                task,
                projectContext,
                contextFailed,
                error,
                currentAccumulatedContext,
                historyQuery,
            );

            if (responseAgent.status === "NEED_CONTEXT") {
                const newRequests = responseAgent.information_requests || [];

                const duplicateRequests: string[] = [];
                const validRequests = newRequests.filter(req => {
                    const reqKey = req.type === "FILE_CONTENT" ? `${req.path} ${req.query}` : req.reason;

                    if (historyQuery.includes(reqKey)) {
                        duplicateRequests.push(reqKey);
                        return false; // Jangan proses ulang
                    }

                    historyQuery.push(reqKey); // Catat ke history
                    return true;
                });

                if (validRequests.length === 0 && duplicateRequests.length > 0) {
                    currentAccumulatedContext = `[SYSTEM WARNING]: Kamu meminta konteks yang sudah pernah diberikan sebelumnya (${duplicateRequests.join(', ')}). Harap gunakan informasi yang ada atau minta informasi lain yang belum ada di HISTORY.`;
                } else {
                    // Jalankan request yang benar-benar baru
                    const newContext = await this.handleInformationRequest(
                        agent,
                        { ...responseAgent, information_requests: validRequests },
                        this.database,
                        this.embedding
                    );

                    currentAccumulatedContext = newContext;
                    accumulatedContext += `\n\n--- [CONTEXT REFRESH #${refresh}] ---\n` + newContext;
                }
            }

            if (responseAgent.status === "READY") {
                stopProcess = true;
            }
            refresh += 1;
        }

        console.log(accumulatedContext);

        const errorHandler = await this.execute.errorHandler(agent, model, task, projectContext, contextFailed, error, accumulatedContext);
        if (errorHandler.status === "READY") {
            for (const op of errorHandler.operations) {
                const execResult = await this.execute.executeResult(op);

                this.receiveMessage.receiveNewHistory(webviewView, execResult.operationResult);

                if (execResult.success) {
                    await this.updateEmbedding(agent, op);
                }
                if (execResult.error) {
                    this.errorHandler(webviewView, agent, model, task, projectContext, execResult.error, operation, retry - 1);
                }
            }
        }

        if (!stopProcess) {
            console.warn(`[ErrorHandler] Mencapai batas maksimum retry (${refresh}x). Proses dihentikan.`);
        }
    }

    getFileUri(path: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error("Tidak ada workspace yang sedang terbuka.");
        }

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, path);
        return fileUri;
    }

    async emebddingFile(agent: AgentAI, uri: vscode.Uri) {
        const document = await vscode.workspace.openTextDocument(uri);

        const text = document.getText();
        if (!text.trim()) return;
        const findPath = await this.database.getEmbeddingsByPath(uri.path);
        if (findPath) {
            await this.database.deleteEmbeddingsByPath(uri.path);
        }
        const vectors = await this.embedding.embeddings(agent, text, uri.path);
        await this.database.saveEmbeddings(vectors);
    }

    async updateEmbedding(agent: AgentAI, operation: Operation) {
        if (operation.type === "CREATE") {
            const fileUri = this.getFileUri(operation.path);
            await this.emebddingFile(agent, fileUri);
        }
        if (operation.type === "MODIFY") {
            const fileUri = this.getFileUri(operation.path);
            await this.emebddingFile(agent, fileUri);
        }
    }


    async handleInformationRequest(agent: AgentAI, request: SearchRelevantCode, database: DatabaseSql, embedding: EmbeddingService): Promise<string> {
        const contexts: string[] = [];

        for (const infoReq of request.information_requests) {
            switch (infoReq.type) {
                case "PROJECT_STRUCTURE": {
                    const res = await this.projectContext.getProjectStructure(infoReq.reason);
                    contexts.push(res);
                    break;
                }

                case "SEMANTIC_SEARCH": {
                    const res = await this.projectContext.getSemanticSearch(agent, infoReq.query, infoReq.reason, database, embedding);
                    contexts.push(res);
                    break;
                }

                case "FILE_CONTENT": {
                    const res = await this.projectContext.getFileContent(agent, database, embedding, infoReq.path, infoReq.query, infoReq.reason);
                    contexts.push(res);
                    break;
                }

                case "SYMBOL_SEARCH": {
                    const res = await this.projectContext.getSymbolSearch(infoReq.query, infoReq.reason);
                    contexts.push(res);
                    break;
                }

                case "DEPENDENCY_INFO": {
                    const res = await this.projectContext.getDependencyInfo(infoReq.reason);
                    contexts.push(res);
                    break;
                }
            }
        }

        return contexts.join('\n=========================================\n\n');
    }

}