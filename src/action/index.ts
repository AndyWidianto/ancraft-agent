import { GoogleAgent } from "../agent/google";
import OpenAIService from "../agent/openai";
import type { AgentAI, AIModelData, BuildTask, ExecuteOperationFailedMessage, ExecuteTaskResult, Model, Operation, OperationError, SearchRelevantCode, StatusTask, TextMessage, TypeProvider, UserMessage } from "../lib/types";
import vscode from "vscode";
import ReceiveMessage from "../receiveMessage";
import { Execute } from "../executor/execute";
import ProjectContext from "../lib/projectContext";
import { v4 as uuid } from "uuid";
import DatabaseSql from "../config";
import EmbeddingService from "../lib/embeddings";
import { ModelService } from "../model";
import AnthropicAgent from "../agent/anthreopic";
import { DocumentationService } from "../lib/documentation/documentation";
import DeepSeekService from "../agent/deepsek";


export default class ActionService {
    private agentPlan: { providerId: number, model: string, agent: AgentAI } | null = null;
    private agentExecutor: { providerId: number, model: string, agent: AgentAI } | null = null;
    private agentIndexing: { providerId: number, model: string, agent: AgentAI } | null = null;
    private agentContextBuilder: { providerId: number, model: string, agent: AgentAI } | null = null;
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
    }: { provider: TypeProvider, apikey: string }) {
        if (!provider) {
            throw new Error("Provider tidak tersedia.");
        }
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
            case "DEEPSEEK": {
                agent = new DeepSeekService(apikey);
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

    async readModels(webviewView: vscode.WebviewView) {
        const models = await this.database.getModels();
        this.receiveMessage.receiveModels(webviewView, models, "READ");

        const modelEmbed = await this.database.getAgentConfig("EMBEDDING");
        const modelPlan = await this.database.getAgentConfig("PLANNER");
        const modelExecut = await this.database.getAgentConfig("EXECUTOR");
        const modelContext = await this.database.getAgentConfig("CONTEXT_BUILDER");

        const selected: {
            indexing: AIModelData | null,
            planning: AIModelData | null,
            executor: AIModelData | null,
            context: AIModelData | null
        } = {
            indexing: null,
            planning: null,
            executor: null,
            context: null,
        }

        if (modelEmbed) {
            const model = models.find(model => model.id === modelEmbed.model_id) ?? null;
            if (model) {
                selected.indexing = model;
                const provider = await this.database.getProviderById(model.provider_id);
                if (!provider || (provider && !provider.api_key)) {
                    throw new Error("Model tidak tersedia!.");
                }

                const agent = await this.connectedProvider({
                    provider: provider.provider as TypeProvider,
                    apikey: provider.api_key || ""
                });
                this.agentIndexing = {
                    providerId: provider.id || 1,
                    agent: agent,
                    model: model?.model_code,
                }

                // const embed = await agent.embedding("User", model.model_code);
                // const res = await this.projectContext.getFileContent(agent, model.model_code, this.database, this.embedding, 'prisma/schema.prisma', 'model', '');

                // Ubah setiap item Proxy menjadi objek biasa menggunakan spread operator (...)
                // const cleanRes = res.map(r => ({ ...r }));

                // console.log("Search: ", res);
            }
        }
        if (modelExecut) {
            const model = models.find(model => model.id === modelExecut.model_id) ?? null;
            if (model) {
                selected.executor = model;
                const provider = await this.database.getProviderById(model.provider_id);
                if (!provider || (provider && !provider.api_key)) {
                    throw new Error("Model tidak tersedia!.");
                }

                const agent = await this.connectedProvider({
                    provider: provider.provider as TypeProvider,
                    apikey: provider.api_key || ""
                });
                this.agentExecutor = {
                    providerId: provider.id || 1,
                    agent: agent,
                    model: model?.model_code,
                }
            }
        }
        if (modelPlan) {
            const model = models.find(model => model.id === modelPlan.model_id) ?? null;
            if (model) {
                selected.planning = model;
                const provider = await this.database.getProviderById(model.provider_id);
                if (!provider || (provider && !provider.api_key)) {
                    throw new Error("Model tidak tersedia!.");
                }

                const agent = await this.connectedProvider({
                    provider: provider.provider as TypeProvider,
                    apikey: provider.api_key || ""
                });
                this.agentPlan = {
                    providerId: provider.id || 1,
                    agent: agent,
                    model: model?.model_code,
                }
            }
        }
        if (modelContext) {
            console.log("Context: ", { ...modelContext });
            const model = models.find(model => model.id === modelContext.model_id) ?? null;
            if (model) {
                selected.context = model;
                const provider = await this.database.getProviderById(model.provider_id);
                if (!provider || (provider && !provider.api_key)) {
                    throw new Error("Model tidak tersedia!.");
                }

                const agent = await this.connectedProvider({
                    provider: provider.provider as TypeProvider,
                    apikey: provider.api_key || ""
                });
                this.agentContextBuilder = {
                    providerId: provider.id || 1,
                    agent: agent,
                    model: model?.model_code,
                }
            }
        }

        this.receiveMessage.receiveMessageSelectedModel(webviewView, selected)
    }

    async selectedModel(data: { type: "EXECUTOR" | "EMBEDDING" | "PLANNER" | "CONTEXT_BUILDER", model: AIModelData }) {
        console.log("Data select: ", data);
        await this.database.saveAgentConfig({
            agentType: data.type,
            modelId: data.model.id || 0,
            temperature: 0,
            systemPrompt: ""
        });

        switch (data.type) {
            case "EMBEDDING": {
                const provider = await this.database.getProviderById(data.model?.provider_id);
                if (!provider || (provider && !provider.api_key)) {
                    throw new Error("Model tidak tersedia!.");
                }

                const agent = await this.connectedProvider({
                    provider: provider.provider as TypeProvider,
                    apikey: provider.api_key || ""
                });
                this.agentIndexing = {
                    providerId: provider.id || 1,
                    agent: agent,
                    model: data.model?.model_code,
                }
            }
            case "PLANNER": {
                const provider = await this.database.getProviderById(data.model?.provider_id);
                if (!provider || (provider && !provider.api_key)) {
                    throw new Error("Model tidak tersedia!.");
                }

                const agent = await this.connectedProvider({
                    provider: provider.provider as TypeProvider,
                    apikey: provider.api_key || ""
                });
                this.agentPlan = {
                    providerId: provider.id || 1,
                    agent: agent,
                    model: data.model?.model_code,
                }
            }
            case "EXECUTOR": {
                const provider = await this.database.getProviderById(data.model?.provider_id);
                if (!provider || (provider && !provider.api_key)) {
                    throw new Error("Model tidak tersedia!.");
                }

                const agent = await this.connectedProvider({
                    provider: provider.provider as TypeProvider,
                    apikey: provider.api_key || ""
                });
                this.agentExecutor = {
                    providerId: provider.id || 1,
                    agent: agent,
                    model: data.model?.model_code,
                }
            }
            case "CONTEXT_BUILDER": {
                const provider = await this.database.getProviderById(data.model?.provider_id);
                if (!provider || (provider && !provider.api_key)) {
                    throw new Error("Model tidak tersedia!.");
                }

                const agent = await this.connectedProvider({
                    provider: provider.provider as TypeProvider,
                    apikey: provider.api_key || ""
                });

                this.agentContextBuilder = {
                    providerId: provider.id || 1,
                    agent: agent,
                    model: data.model?.model_code,
                }
            }
        }
    }

    async saveModels(data: { provider: string; apikey: string; base_url?: string; models: Model[] }) {
        if (!this.database) throw new Error("Database belum diinisialisasi.");

        const providerId = await this.database.createProvider({
            provider: data.provider,
            api_key: data.apikey,
            base_url: data.base_url || '',
            is_active: 1
        });

        const models: AIModelData[] = [];

        for (const modelItem of data.models) {
            const modelType: 'LLM' | 'EMBEDDING' = modelItem.isEmbedding ? 'EMBEDDING' : 'LLM';

            const model = await this.database.createModel({
                provider_id: providerId, // Menggunakan ID asli dari tabel ai_providers
                provider_name: data.provider,
                model_code: modelItem.code_name,
                model_name: modelItem.name,
                type: modelType,
                max_tokens: 0,
                is_default: (modelItem.selectedPlanning || modelItem.selectedExecutor || modelItem.selectedIndexing) ? 1 : 0
            });
            models.push(model)
        }
        return models;
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

            const newModels = await this.saveModels(data);

            // Kirim tetap berjalan ke UI Webview
            this.receiveMessage.receiveModels(webviewView, newModels, "CREATE");

            if (provider === "GEMINI") {
                await modelService.saveModelConfig('.embedding.json', { apikey, provider });
            }
        } catch (err) {
            console.error("Gagal mengambil model:", err);
        }
    }

    async executeTask(
        webviewView: vscode.WebviewView,
        projectContext: string,
        task: BuildTask,
        message: UserMessage,
        signal?: AbortSignal,
        reason?: string,
        result_search?: {
            context: string[],
            history_query: string[]
        },
        retry = 3
    ) {
        if (retry <= 0) throw new Error("Execute berhenti karena sudah melakukan refresh 3x.");
        if (!this.agentContextBuilder || !this.agentPlan || !this.agentIndexing || !this.agentExecutor) return;

        if (!projectContext.trim()) {
            projectContext = await this.execute.getProjectContext(true);
        }

        let accumulatedContext: string[] = [...(result_search?.context ?? task.history?.context ?? [])];
        let currentAccumulatedContext = "";
        let historyQuery: string[] = [...(result_search?.history_query ?? task.history?.query ?? [])];
        let refresh = 0;
        let isCompleted = false;

        try {
            if (task.type === "SETUP") {
                isCompleted = true;
            }

            const workspaceTree = await this.projectContext.getWorkspaceTree();

            while (!isCompleted && refresh <= 5) {
                const context = await this.execute.searchRelevantCode(
                    this.agentContextBuilder.agent,
                    this.agentContextBuilder.model,
                    reason ? reason : task.task,
                    workspaceTree,
                    historyQuery,
                    currentAccumulatedContext,
                );

                if (context.status === "NEED_CONTEXT") {
                    const newRequests = context.information_requests || [];

                    const newContexts = await this.handleInformationRequest(
                        { ...context, information_requests: newRequests },
                        this.database,
                        this.embedding
                    );

                    historyQuery.push(...newContexts.map(c => c.query));

                    newContexts.forEach((newContext) => {
                        if (!accumulatedContext.includes(newContext?.text) && newContext.type !== "PROJECT_STRUCTURE"
                            && newContext.type !== "DEPENDENCY_INFO") {
                            accumulatedContext.push(newContext?.text);
                        }
                    })
                }

                if (context.status === "READY") {
                    isCompleted = true;
                }

                refresh += 1;
            }

            let responseAgent: ExecuteTaskResult;

            if (task.type != "SETUP") {
                responseAgent = await this.execute.Execute(
                    this.agentExecutor.agent,
                    this.agentExecutor.model,
                    task.task,
                    message.text,
                    projectContext,
                    accumulatedContext.join('\n\n'),
                    "",
                    signal
                );
            } else {
                responseAgent = await this.execute.setupProject(
                    this.agentExecutor.agent,
                    this.agentExecutor.model,
                    task.task,
                    projectContext
                )
            }

            if (responseAgent.status === "READY") {
                webviewView.webview.postMessage({
                    command: "RECEIVE_MESSAGE",
                    action: "NEW_OPERATION",
                    taskId: task.id,
                    data: responseAgent.operations
                })
                for (const operation of responseAgent.operations) {
                    await this.executeOperation(webviewView, operation, task, signal);
                }
                webviewView.webview.postMessage({
                    command: "RECEIVE_MESSAGE",
                    action: "UPDATE_TASK",
                    data: {
                        ...task,
                        status: "DONE",
                    },
                    taskId: task.id
                })
            }
            if (responseAgent.status === "BLOCKED") {
                await this.executeTask(webviewView, projectContext, task, message, signal, responseAgent.summary, {
                    context: accumulatedContext,
                    history_query: historyQuery
                }, retry - 1)
            }
        } catch (err) {
            webviewView.webview.postMessage({
                command: "RECEIVE_MESSAGE",
                action: "UPDATE_TASK",
                data: {
                    ...task,
                    history: {
                        context: accumulatedContext,
                        query: historyQuery
                    }
                },
                taskId: task.id
            })
            throw err;
        }
    }

    async buildTask(
        webviewView: vscode.WebviewView,
        message: UserMessage,
        signal?: AbortSignal,
        history?: string[],
    ) {
        if (!this.agentContextBuilder || !this.agentPlan || !this.agentIndexing || !this.agentExecutor) return;

        const completedTasks: string[] = [...history ?? []]
        let lastResult = "";

        try {
            let projectContext = await this.execute.getProjectContext(true, "");
            const task = await this.execute.buildTask(this.agentPlan.agent, this.agentPlan?.model, projectContext, {
                text: message.text,
                completedTasks,
                lastResult,
            })
            const taskId = uuid();
            webviewView.webview.postMessage({
                command: "RECEIVE_MESSAGE",
                action: "NEW_TASK",
                data: {
                    ...task,
                    id: taskId
                }
            })
            if (task.status === "DONE") {
                this.execute.totalTokens();
                webviewView.webview.postMessage({
                    command: "RECEIVE_MESSAGE",
                    action: "FINISH",
                })
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    }

    async executeOperation(webviewView: vscode.WebviewView, operation: Operation, task: BuildTask, signal?: AbortSignal) {
        if (!this.agentContextBuilder || !this.agentExecutor) throw new Error("Model belum di setting");

        let isSuccess = false;

        try {
            let result = await this.execute.executeResult(operation);
            isSuccess = result.success;

            console.log("Response Operation: ", result);

            if (!result.success) {
                const fileUri = this.getFileUri(operation.type === "MODIFY" ? operation.path : operation.type === "CREATE" ? operation.path : "");
                await this.emebddingFile(fileUri);
                result = await this.execute.executeResult(operation);
            }

            // Kirim hasil history
            this.receiveMessage.receiveNewHistory(webviewView, result.operationResult);

            if (!result.success && result.error) {
                const projectContext = await this.execute.getProjectContext(true, "");
                const isSuccessHandleError = await this.errorHandler(webviewView, task.task, projectContext, result.error, operation);
                if (isSuccessHandleError) {
                    isSuccess = true;
                }
            }

            // Update embedding jika sukses
            if (isSuccess) {
                await this.updateEmbedding(operation);
            }
        } catch (error) {
            console.error("[ExecuteOperation] Crash/Unhandled Error:", error);
            throw error;
        }
    }

    // async executeOperation(webviewView: vscode.WebviewView, message: ExecuteOperationMessage, signal?: AbortSignal) {

    //     const item = message.data;
    //     const operation = item.operation;


    //     const provider = await this.database.getProviderById(message.meta.providerId);
    //     if (!provider || (provider && !provider.api_key)) {
    //         throw new Error("Model tidak tersedia!.");
    //     }

    //     const agent = await this.connectedProvider({
    //         provider: provider.provider as TypeProvider,
    //         apikey: provider.api_key || ""
    //     });


    //     let isSuccess = false;

    //     try {
    //         let result = await this.execute.executeResult(operation);
    //         isSuccess = result.success;

    //         console.log("Response Operation: ", result);

    //         if (!result.success) {
    //             const fileUri = this.getFileUri(operation.type === "MODIFY" ? operation.path : operation.type === "CREATE" ? operation.path : "");
    //             await this.emebddingFile(fileUri);
    //             result = await this.execute.executeResult(operation);
    //         }

    //         // Kirim hasil history
    //         this.receiveMessage.receiveNewHistory(webviewView, result.operationResult);

    //         if (!result.success && result.error && operation.type === "COMMAND") {
    //             console.error("Error", result);
    //             const projectContext = await this.execute.getProjectContext(true, "");
    //             const isSuccessHandleError = await this.errorHandler(webviewView, item?.task, projectContext, result.error, operation);
    //             if (isSuccessHandleError) {
    //                 isSuccess = true;
    //             }
    //         }

    //         // Update embedding jika sukses
    //         if (isSuccess) {
    //             await this.updateEmbedding(operation);
    //         }

    //         const finalStatus: StatusTask = isSuccess ? "DONE" : "FAILED";

    //         this.receiveMessage.receiveUpdateOperation(
    //             webviewView,
    //             message.data.planningId,
    //             item.stepId,
    //             item.taskId,
    //             finalStatus,
    //             operation.id,
    //             operation,
    //             result.error
    //         );

    //     } catch (error) {
    //         console.error("[ExecuteOperation] Crash/Unhandled Error:", error);
    //         this.receiveMessage.receiveUpdateOperation(
    //             webviewView,
    //             message.data.planningId,
    //             item.stepId,
    //             item.taskId,
    //             "FAILED",
    //             operation.id,
    //             operation,
    //             error,
    //         );
    //         throw error;
    //     }
    // }

    async resloveError(webviewView: vscode.WebviewView, message: ExecuteOperationFailedMessage, signal?: AbortSignal) {
        const item = message.data;
        const operation = item.operation;


        let isSuccess = false;

        try {
            let result = await this.execute.executeResult(operation);
            isSuccess = result.success;

            if (!result.success && result.error) {
                console.error("Error", result);
                const projectContext = await this.execute.getProjectContext(true, "");
                const isSuccessHandleError = await this.errorHandler(webviewView, item?.task, projectContext, result.error, operation);
                if (isSuccessHandleError) {
                    isSuccess = true;
                }
            }

            if (isSuccess) {
                await this.updateEmbedding(operation);
            }


        } catch (error) {
            console.error("[ExecuteOperation] Crash/Unhandled Error:", error);
            throw error;
        }
    }

    async errorHandler(
        webviewView: vscode.WebviewView,
        task: string,
        projectContext: string,
        error: OperationError,
        operation: Operation,
        retry = 3,
        result_search?: {
            content: string[];
            history_query: string[];
        },
        reason?: string,
    ) {
        if (retry <= 0) return false;
        if (!this.agentContextBuilder || !this.agentExecutor) throw new Error("Agent belum tersedia");

        const contextFailed = JSON.stringify(operation);
        let stopProcess = false;
        let refresh = 0;
        let currentAccumulatedContext = "";
        let historyQuery: string[] = [...(result_search?.history_query ?? [])];

        const accumulatedContext: string[] = [...(result_search?.content ?? [])];

        const workspaceTree = await this.projectContext.getWorkspaceTree();

        while (!stopProcess && refresh <= 5) {
            const responseAgent = await this.execute.searchRelevantCode(
                this.agentContextBuilder.agent,
                this.agentContextBuilder.model,
                reason ? reason : JSON.stringify(error),
                workspaceTree,
                historyQuery,
                currentAccumulatedContext,
            );

            if (responseAgent.status === "NEED_CONTEXT") {
                const newContexts = await this.handleInformationRequest(
                    responseAgent,
                    this.database,
                    this.embedding
                );

                newContexts.forEach((newContext) => {
                    if (accumulatedContext.includes(newContext?.text) && newContext.type !== "PROJECT_STRUCTURE") {
                        accumulatedContext.push(newContext?.text);
                    }
                    historyQuery.push(newContext.query);
                })
            }

            if (responseAgent.status === "READY") {
                stopProcess = true;
            }
            refresh += 1;
        }

        const errorHandler = await this.execute.errorHandler(this.agentExecutor.agent, this.agentExecutor.model, task, projectContext, contextFailed, error, accumulatedContext.join('\n\n'));
        if (errorHandler.status === "READY") {
            for (const op of errorHandler.operations) {
                const execResult = await this.execute.executeResult(op);

                this.receiveMessage.receiveNewHistory(webviewView, execResult.operationResult);

                if (execResult.success || !execResult.error) {
                    await this.updateEmbedding(op);
                } else {
                    this.errorHandler(webviewView, task, projectContext, execResult.error, operation, retry - 1);
                }
            }
        }
        if (errorHandler.status === "BLOCKED") {
            await this.errorHandler(webviewView, task, projectContext, error, operation, retry - 1, { content: accumulatedContext, history_query: historyQuery }, errorHandler.summary);
        }

        if (!stopProcess) {
            console.warn(`[ErrorHandler] Mencapai batas maksimum retry (${refresh}x). Proses dihentikan.`);
            return false;
        }
        return true;
    }

    getFileUri(path: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error("Tidak ada workspace yang sedang terbuka.");
        }

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, path);
        return fileUri;
    }

    async emebddingFile(uri: vscode.Uri) {
        if (!this.agentIndexing) throw new Error("Indexing belum di setting nih.");
        try {
            const stat = await vscode.workspace.fs.stat(uri);

            if (stat.type === vscode.FileType.Directory) {
                console.warn(`[Embedding] Dilewati: '${uri.path}' adalah sebuah direktori, bukan file.`);
                return;
            }
        } catch (error) {
            console.error(`[Embedding] Gagal membaca status path: ${uri.path}`, error);
            return;
        }

        const document = await vscode.workspace.openTextDocument(uri);

        const text = document.getText();
        if (!text.trim()) return;

        const findPath = await this.database.getEmbeddingsByPath(uri.path);
        if (findPath) {
            await this.database.deleteEmbeddingsByPath(uri.path);
        }

        const vectors = await this.embedding.embeddings(this.agentIndexing.agent, this.agentIndexing.model, text, uri.path);
        await this.database.saveEmbeddings(vectors);
    }

    async updateEmbedding(operation: Operation) {
        if (operation.type === "CREATE") {
            const fileUri = this.getFileUri(operation.path);
            await this.emebddingFile(fileUri);
        }
        if (operation.type === "MODIFY") {
            const fileUri = this.getFileUri(operation.path);
            await this.emebddingFile(fileUri);
        }
    }

    async handleInformationRequest(request: SearchRelevantCode, database: DatabaseSql, embedding: EmbeddingService) {
        if (!this.agentIndexing) throw new Error("Indexing belum di setting nih.");
        const contexts: { text: string, type: string, query: string }[] = [];

        for (const infoReq of request.information_requests) {
            switch (infoReq.type) {
                case "PROJECT_STRUCTURE": {
                    const res = await this.projectContext.getProjectStructure(infoReq.reason, '.', true);
                    contexts.push({ text: res, type: infoReq.type, query: "PROJECT_STRUCTURE" });
                    break;
                }

                case "SEMANTIC_SEARCH": {
                    const uri = this.getFileUri('.');
                    const res = await this.projectContext.getSemanticSearch(this.agentIndexing.agent, this.agentIndexing.model, infoReq.query, infoReq.reason, database, uri.path);
                    const query = `search: ${infoReq.query} (${res.isNotFound ? "NOT FOUND" : "FOUND"})`;
                    contexts.push({ text: res.text, type: infoReq.type, query });
                    break;
                }

                case "FILE_CONTENT": {
                    const res = await this.projectContext.getFileContent(this.agentIndexing.agent, this.agentIndexing.model, database, embedding, infoReq.path, infoReq.query, infoReq.reason);
                    const query = `path: ${infoReq.path} search: ${infoReq.query} (${res.isNotFound ? "NOT FOUND" : "FOUND"})`;
                    contexts.push({ text: res.text, type: infoReq.type, query });
                    break;
                }

                case "FULL_FILE": {
                    const res = await this.projectContext.getFullFileContent(infoReq.path, infoReq.reason);
                    const query = `path: ${infoReq.path} (${res.isNotFound ? "NOT FOUND" : "FOUND"})`;
                    contexts.push({ text: res.text, type: infoReq.type, query });
                    break;
                }

                case "SYMBOL_SEARCH": {
                    const res = await this.projectContext.getSymbolSearch(infoReq.query, infoReq.reason);
                    const query = `SYMBOL_SEARCH: ${infoReq.query} (${res.isNotFound ? "NOT FOUND" : "FOUND"})`;
                    contexts.push({ text: res.text, type: infoReq.type, query });
                    break;
                }

                case "DEPENDENCY_INFO": {
                    const res = await this.projectContext.getDependencyInfo(infoReq.reason);
                    const query = `${infoReq.type}: ${infoReq.reason}`;
                    contexts.push({ text: res, type: infoReq.type, query });
                    break;
                }

                case "DOCUMENTATION": {
                    const embeddingQuery = await this.embedding.embedding(this.agentIndexing.agent, this.agentIndexing.model, infoReq.query);
                    const findDocumentation = await this.database.searchDocumentation(embeddingQuery, 2);
                    const query = `${infoReq.library}: ${infoReq.query}`;
                    if (findDocumentation.length > 0) {
                        contexts.push(...findDocumentation.map(doc => ({ type: infoReq.type, text: doc?.content ?? "", query })));
                        break;
                    }
                    const documentation = new DocumentationService();
                    const docs = await documentation.search(infoReq);
                    console.log("Docs: ", docs);
                    const embedding = await this.embedding.embedding(this.agentIndexing.agent, this.agentIndexing.model, docs.content);
                    await this.database.saveDocumentation(docs, embedding);
                    contexts.push({ type: infoReq.type, text: docs.content, query });
                    break;
                }
            }
        }
        return contexts;
    }

}