import { GoogleAgent } from "../agent/google";
import OpenAIService from "../agent/openai";
import type { AgentAI, AIModelData, ExecuteOperationFailedMessage, ExecuteOperationMessage, ExecuteStepMessage, ExecuteTaskMessage, ExecuteTaskResult, Model, Operation, OperationError, SearchRelevantCode, StatusTask, TextMessage, TypeProvider } from "../lib/types";
import vscode from "vscode";
import ReceiveMessage from "../receiveMessage";
import { Execute } from "../lib/execute";
import ProjectContext from "../lib/projectContext";
import { v4 as uuid } from "uuid";
import DatabaseSql from "../config";
import EmbeddingService from "../lib/embeddings";
import { ModelService } from "../model";
import AnthropicAgent from "../agent/anthreopic";
import { DocumentationService } from "../lib/documentation/documentation";



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
    }: { provider: "GEMINI" | "OPENAI" | "ANTHROPIC", apikey: string }) {
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

    async getPlanning(webviewView: vscode.WebviewView, data: TextMessage, signal?: AbortSignal) {
        if (!this.agentPlan) return;

        //const analisis = await this.execute.getAnalisisTeckStack(agent, data.data.text, data.meta.model, signal);
        const projectContext = await this.execute.getProjectContext(true, "");
        const planning = await this.execute.getPlanning(this.agentPlan.agent, this.agentPlan.model, data.data.text, projectContext, signal);

        const planningId = uuid();
        this.receiveMessage.receivePlanning(webviewView, { ...planning, id: planningId, status: "IN_PROGRESS" });
    }

    async executeStep(webviewView: vscode.WebviewView, message: ExecuteStepMessage, signal?: AbortSignal) {
        if (!this.agentPlan) return;

        const item = message.data;
        const typeStep = item.type;
        console.log("Step Palnning: ", item.step);
        try {
            this.receiveMessage.receiveUpdateStep(webviewView, item.planningId, item.stepId, "IN_PROGRESS");
            const projectContext = await this.execute.getProjectContext(true, "");

            const subPlanning = await this.execute.getSubPlanning(
                this.agentPlan.agent,
                this.agentPlan.model,
                projectContext,
                item.goal,
                item.step,
                typeStep,
                item.previousTasks,
                item.nextTasks,
                signal
            );

            this.receiveMessage.receiveNewTask(webviewView, item.planningId, item.stepId, subPlanning.tasks);
            this.receiveMessage.receiveUpdateStep(webviewView, item.planningId, item.stepId, "DONE");
        } catch (err) {
            this.receiveMessage.receiveUpdateStep(webviewView, item.planningId, item.stepId, "FAILED");
            throw err;
        }
    }

    async executeTask(
        webviewView: vscode.WebviewView,
        message: ExecuteTaskMessage,
        signal?: AbortSignal,
        reason?: string,
        retry = 3
    ) {
        if (!this.agentContextBuilder || !this.agentExecutor || !this.agentIndexing) return;

        const item = message.data;
        const meta = message.meta;
        const role = message.data.type;
        const techStack = message?.techStack;

        let accumulatedContext: string[] = [...(item.result_search?.content ?? [])];
        let currentAccumulatedContext = "";
        let historyQuery: string[] = [...(item.result_search?.history_query ?? [])];
        let refresh = 0;
        let isCompleted = false;
        let responseAgent: ExecuteTaskResult;

        try {

            this.receiveMessage.receiveUpdateTask(webviewView, message.data.planningId, item.stepId, item.taskId, "IN_PROGRESS", {
                context: accumulatedContext,
                history_query: historyQuery
            });

            let projectContext = await this.execute.getProjectContext(true, "");

            const operationHistory = this.projectContext.buildExecutionHistoryContext(message.history);


            if (message.data.type === "SETUP") {
                isCompleted = true;
            }

            while (!isCompleted && refresh <= 5) {

                const context = await this.execute.searchRelevantCode(
                    this.agentContextBuilder.agent,
                    meta.model,
                    reason ? reason : item.task,
                    projectContext,
                    historyQuery,
                    currentAccumulatedContext,
                );

                if (context.status === "NEED_CONTEXT") {
                    const newRequests = context.information_requests || [];

                    // Filter request untuk memisahkan request baru dan request duplikat
                    const duplicateRequests: string[] = [];
                    const validRequests = newRequests.filter(req => {
                        let reqKey = '';

                        if (req.type === "FILE_CONTENT") {
                            reqKey = `path: ${req.path} search: ${req.query}`;
                        } else if (req.type === "FULL_FILE") {
                            reqKey = `FULL_FILE: ${req.path}`;
                        } else if (req.type === "DOCUMENTATION") {
                            reqKey = `DOCUMENTATION: ${req.library} search:${req.query}`;
                        } else {
                            reqKey = `${req.type}:${(req as any)?.query || ''}`;
                        }

                        if (historyQuery.includes(reqKey)) {
                            duplicateRequests.push(reqKey);
                            return false;
                        }

                        historyQuery.push(reqKey);
                        return true;
                    });

                    const newContexts = await this.handleInformationRequest(
                        { ...context, information_requests: validRequests },
                        this.database,
                        this.embedding
                    );

                    currentAccumulatedContext = newContexts.map(cntx => cntx.text).join('\n\n');
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

            console.log(accumulatedContext.join('\n'));

            if (role !== "SETUP") {
                responseAgent = await this.execute.Execute(
                    this.agentExecutor.agent,
                    role,
                    message.meta.model,
                    item.task,
                    projectContext,
                    accumulatedContext.join('\n\n'),
                    (item.previousTasks ?? []).join('\n'),
                    (item.nextTasks ?? []).join('\n'),
                    operationHistory,
                    signal
                );
            } else {
                responseAgent = await this.execute.setupProject(this.agentExecutor.agent, message.meta.model, message.data.task, techStack, operationHistory, projectContext, signal);
            }
            if (responseAgent.status === "READY") {
                console.log(responseAgent);
                const operations = responseAgent.operations.map((operation, index) => ({ ...operation, id: index + 1 }));
                this.receiveMessage.receiveOperations(webviewView, message.data.planningId, item.stepId, item.taskId, operations);
                this.receiveMessage.receiveUpdateTask(webviewView, message.data.planningId, item.stepId, item.taskId, "DONE", {
                    context: accumulatedContext,
                    history_query: historyQuery
                });
            }
            if (responseAgent.status === "BLOCKED") {
                console.log("Blocked menjalankan Task: ", responseAgent);
                if (retry <= 0) {
                    this.receiveMessage.receiveUpdateTask(webviewView, message.data.planningId, item.stepId, item.taskId, "FAILED", {
                        context: accumulatedContext,
                        history_query: historyQuery
                    });
                    return
                }
                await this.executeTask(webviewView, {
                    ...message, data: {
                        ...message.data, result_search: {
                            content: accumulatedContext,
                            history_query: historyQuery
                        }
                    }
                }, signal, responseAgent?.summary, retry - 1);
            }
        } catch (err) {
            console.error(err);
            this.receiveMessage.receiveUpdateTask(webviewView, message.data.planningId, item.stepId, item.taskId, "FAILED", {
                context: accumulatedContext,
                history_query: historyQuery
            });
            throw err;
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

        const provider = await this.database.getProviderById(message.meta.providerId);
        if (!provider || (provider && !provider.api_key)) {
            throw new Error("Model tidak tersedia!.");
        }

        const agent = await this.connectedProvider({
            provider: provider.provider as TypeProvider,
            apikey: provider.api_key || ""
        });


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

            if (!result.success && result.error && operation.type === "COMMAND") {
                console.error("Error", result);
                const projectContext = await this.execute.getProjectContext(true, "");
                const isSuccessHandleError = await this.errorHandler(webviewView, item?.task, projectContext, result.error, operation);
                if (isSuccessHandleError) {
                    isSuccess = true;
                }
            }

            // Update embedding jika sukses
            if (isSuccess) {
                await this.updateEmbedding(operation);
            }

            const finalStatus: StatusTask = isSuccess ? "DONE" : "FAILED";

            this.receiveMessage.receiveUpdateOperation(
                webviewView,
                message.data.planningId,
                item.stepId,
                item.taskId,
                finalStatus,
                operation.id,
                operation,
                result.error
            );

        } catch (error) {
            console.error("[ExecuteOperation] Crash/Unhandled Error:", error);
            this.receiveMessage.receiveUpdateOperation(
                webviewView,
                message.data.planningId,
                item.stepId,
                item.taskId,
                "FAILED",
                operation.id,
                operation,
                error,
            );
            throw error;
        }
    }

    async resloveError(webviewView: vscode.WebviewView, message: ExecuteOperationFailedMessage, signal?: AbortSignal) {
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

        const provider = await this.database.getProviderById(message.meta.providerId);
        if (!provider || (provider && !provider.api_key)) {
            throw new Error("Model tidak tersedia!.");
        }

        const agent = await this.connectedProvider({
            provider: provider.provider as TypeProvider,
            apikey: provider.api_key || ""
        });


        let isSuccess = false;

        try {
            let result = await this.execute.executeResult(operation);
            isSuccess = result.success;

            // Kirim hasil history
            this.receiveMessage.receiveNewHistory(webviewView, result.operationResult);

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

            const finalStatus: StatusTask = isSuccess ? "DONE" : "FAILED";

            this.receiveMessage.receiveUpdateOperation(
                webviewView,
                message.data.planningId,
                item.stepId,
                item.taskId,
                finalStatus,
                operation.id,
                operation,
                result.error
            );

        } catch (error) {
            console.error("[ExecuteOperation] Crash/Unhandled Error:", error);
            this.receiveMessage.receiveUpdateOperation(
                webviewView,
                message.data.planningId,
                item.stepId,
                item.taskId,
                "FAILED",
                operation.id,
                operation,
                error,
            );
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

        while (!stopProcess && refresh <= 5) {
            // Panggil Agent
            const responseAgent = await this.execute.searchRelevantCode(
                this.agentContextBuilder.agent,
                this.agentContextBuilder.model,
                reason ? reason : JSON.stringify(error),
                projectContext,
                historyQuery,
                currentAccumulatedContext,
            );

            if (responseAgent.status === "NEED_CONTEXT") {
                const newRequests = responseAgent.information_requests || [];

                const duplicateRequests: string[] = [];
                const validRequests = newRequests.filter(req => {
                    const reqKey = req.type === "FILE_CONTENT" ? `${req.path} ${req.query}` : req.type !== "DOCUMENTATION" ? req.reason : req.library;

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
                    const newContexts = await this.handleInformationRequest(
                        { ...responseAgent, information_requests: validRequests },
                        this.database,
                        this.embedding
                    );

                    newContexts.forEach((newContext) => {
                        if (accumulatedContext.includes(newContext?.text) && newContext.type !== "PROJECT_STRUCTURE") {
                            accumulatedContext.push(newContext?.text);
                        }
                    })
                }
            }

            if (responseAgent.status === "READY") {
                stopProcess = true;
            }
            refresh += 1;
        }

        console.log(accumulatedContext);

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
        const contexts: { text: string, type: string }[] = [];

        for (const infoReq of request.information_requests) {
            switch (infoReq.type) {
                case "PROJECT_STRUCTURE": {
                    const res = await this.projectContext.getProjectStructure(infoReq.reason, '.', true);
                    contexts.push({ text: res, type: infoReq.type });
                    break;
                }

                case "SEMANTIC_SEARCH": {
                    const uri = this.getFileUri('.');
                    const res = await this.projectContext.getSemanticSearch(this.agentIndexing.agent, this.agentIndexing.model, infoReq.query, infoReq.reason, database, uri.path);
                    contexts.push({ text: res, type: infoReq.type });
                    break;
                }

                case "FILE_CONTENT": {
                    const res = await this.projectContext.getFileContent(this.agentIndexing.agent, this.agentIndexing.model, database, embedding, infoReq.path, infoReq.query, infoReq.reason);
                    contexts.push({ text: res, type: infoReq.type });
                    break;
                }

                case "FULL_FILE": {
                    const res = await this.projectContext.getFullFileContent(infoReq.path, infoReq.reason);
                    contexts.push({ text: res, type: infoReq.type });
                    break;
                }

                case "SYMBOL_SEARCH": {
                    const res = await this.projectContext.getSymbolSearch(infoReq.query, infoReq.reason);
                    contexts.push({ text: res, type: infoReq.type });
                    break;
                }

                case "DEPENDENCY_INFO": {
                    const res = await this.projectContext.getDependencyInfo(infoReq.reason);
                    contexts.push({ text: res, type: infoReq.type });
                    break;
                }

                case "DOCUMENTATION": {
                    const embeddingQuery = await this.embedding.embedding(this.agentIndexing.agent, this.agentIndexing.model, infoReq.query);
                    const findDocumentation = await this.database.searchDocumentation(embeddingQuery, 2);
                    if (findDocumentation.length > 0) {
                        console.log("Search: ", findDocumentation);
                        contexts.push(...findDocumentation.map(doc => ({ type: infoReq.type, text: doc?.content ?? "" })));
                        break;
                    }
                    const documentation = new DocumentationService();
                    const docs = await documentation.search(infoReq);
                    console.log("Docs: ", docs);
                    const embedding = await this.embedding.embedding(this.agentIndexing.agent, this.agentIndexing.model, docs.content);
                    await this.database.saveDocumentation(docs, embedding);
                    contexts.push({ type: infoReq.type, text: docs.content });
                    break;
                }
            }
        }

        return contexts;
    }

}