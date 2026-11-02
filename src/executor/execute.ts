import vscode from "vscode";
import { Operation, OperationResult, AgentAI, SearchRelevantCode, BuildTask } from "../lib/types";
import { WorkspaceFileManager } from "../lib/fileManager/workspace";
import { buildExecutePrompt } from "../lib/prompt/executor";
import { ExecuteTaskResult, FailedOperation, OperationError } from "../lib/types/operation";
import { buildErrorAnalysisPrompt, buildErrorRecoveryPrompt } from "../lib/prompt/error";
import ProjectContext from "../lib/projectContext";
import { buildSearchPrompt } from "../lib/prompt/search";
import { buildJSONRepairPrompt } from "../lib/prompt/buildjsonerror";
import { buildTaskPrompt } from "../lib/prompt/buildtaskprompt";
import { buildSetupProject } from "../lib/prompt/setup";

const totalUsedToken = new Map<"inputTokenExecutor" | "outputTokenExecutor" | "inputTokenPlanning" | "outputTokenPlanning" | "inputTokenBuilder" | "outputTokenBuilder", number>();

export class Execute {
    constructor(
        private readonly fileManager: WorkspaceFileManager,
        private readonly projectContext: ProjectContext
    ) { }

    async errorHandler(
        agent: AgentAI,
        model: string,
        task: string,
        projectContext: string,
        failedOperation: string,
        error: OperationError,
        relevantCode?: string,
        signal?: AbortSignal
    ) {
        const promptAnalisis = buildErrorRecoveryPrompt({
            task,
            projectContext,
            failedOperation,
            error,
            relevantCode,
        });
        const responseAgent = await agent.sendMessage(promptAnalisis, model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, responseAgent.text);

        const totalInput = totalUsedToken.get("inputTokenExecutor") || 0;
        const totalOutput = totalUsedToken.get("outputTokenExecutor") || 0;

        totalUsedToken.set("inputTokenExecutor", totalInput + responseAgent.totalTokens.input)
        totalUsedToken.set("outputTokenExecutor", totalOutput + responseAgent.totalTokens.output);
        return parseResponseAgent as ExecuteTaskResult;
    }

    async analisisError(
        agent: AgentAI,
        model: string,
        task: string,
        projectContext: string,
        FailedOperation: string,
        error: OperationError,
        relevantCode: string,
        history: string[],
        signal?: AbortSignal) {
        const prompt = buildErrorAnalysisPrompt({
            task,
            projectContext,
            failedOperation: FailedOperation,
            error,
            relevantCode,
            previousSearches: history.join('\n')
        })
        const response = await agent.sendMessage(prompt, model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, response.text);

        console.log(response.text);

        const totalInput = totalUsedToken.get("inputTokenBuilder") || 0;
        const totalOutput = totalUsedToken.get("outputTokenBuilder") || 0;

        totalUsedToken.set("inputTokenBuilder", totalInput + response.totalTokens.input)
        totalUsedToken.set("outputTokenBuilder", totalOutput + response.totalTokens.output);

        return parseResponseAgent as SearchRelevantCode;
    }

    async extractAndParseJSON<T = unknown>(
        agent: AgentAI,
        model: string,
        rawText: string
    ): Promise<T> {
        if (!rawText?.trim()) {
            throw new Error("Respons dari LLM kosong.");
        }

        const cleanJSON = (text: string): string => {
            let cleaned = text
                .trim()
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```$/, "")
                .trim();

            const firstBracket = cleaned.indexOf("{");
            const lastBracket = cleaned.lastIndexOf("}");

            if (firstBracket !== -1 && lastBracket > firstBracket) {
                cleaned = cleaned.slice(firstBracket, lastBracket + 1);
            }

            return cleaned;
        };

        const cleaned = cleanJSON(rawText);

        try {
            return JSON.parse(cleaned) as T;
        } catch (error) {
            const parseError =
                error instanceof Error ? error.message : String(error);

            console.error("JSON parse failed:", parseError);

            const prompt = buildJSONRepairPrompt({
                rawResponse: cleaned,
                parseError
            });

            const response = await agent.sendMessage(prompt, model, 3);

            if (!response.text?.trim()) {
                throw new Error("JSON Repair Agent mengembalikan respons kosong.");
            }

            // Hanya satu kali repair, tanpa recursive call.
            const repaired = cleanJSON(response.text);

            try {
                const result = JSON.parse(repaired) as T;

                if (
                    typeof result === "object" &&
                    result !== null &&
                    "status" in result &&
                    result.status === "UNRECOVERABLE"
                ) {
                    throw new Error("JSON tidak dapat diperbaiki.");
                }

                return result;
            } catch (repairError) {
                console.error("JSON repair failed:", repairError);

                throw new Error(
                    "Gagal memparse JSON setelah satu kali repair.",
                    { cause: repairError }
                );
            }
        }
    }

    async searchRelevantCode(
        agent: AgentAI,
        model: string,
        task: string,
        projectContext: string,
        previousSearches: string[],
        relevantCode?: string,
        signal?: AbortSignal
    ) {
        const prompt = buildSearchPrompt({
            task,
            projectContext,
            relevantCode,
            previousSearches
        })

        console.log("Builder context: ", prompt);

        const response = await agent.sendMessage(prompt, model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, response.text);

        console.log(response.text);
        const totalInput = totalUsedToken.get("inputTokenBuilder") || 0;
        const totalOutput = totalUsedToken.get("outputTokenBuilder") || 0;

        console.log("Total Ouput context builder: ", response.totalTokens.output + totalOutput);
        console.log("Total Input context builder: ", response.totalTokens.input + totalInput);
        totalUsedToken.set("inputTokenBuilder", totalInput + response.totalTokens.input)
        totalUsedToken.set("outputTokenBuilder", totalOutput + response.totalTokens.output);

        return parseResponseAgent as SearchRelevantCode;
    }

    async setupProject(
        agent: AgentAI,
        model: string,
        task: string,
        projectContext: string,
        signal?: AbortSignal
    ) {
        const prompt = buildSetupProject(task, projectContext);

        const response = await agent.sendMessage(prompt, model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, response.text);

        console.log(response.text);
        const totalInput = totalUsedToken.get("inputTokenExecutor") || 0;
        const totalOutput = totalUsedToken.get("outputTokenExecutor") || 0;


        totalUsedToken.set("inputTokenExecutor", totalInput + response.totalTokens.input)
        totalUsedToken.set("outputTokenExecutor", totalOutput + response.totalTokens.output);

        return parseResponseAgent as ExecuteTaskResult;
    }

    async Execute(
        agent: AgentAI,
        model: string,
        task: string,
        goal: string,
        projectContext: string,
        relevantCode: string,
        operationHistory?: string,
        signal?: AbortSignal
    ) {
        const prompt = buildExecutePrompt({
            task,
            projectContext,
            relevantCode,
            operationHistory,
            goal,
        })

        const response = await agent.sendMessage(prompt, model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, response.text);

        console.log(response.text);

        const totalInput = totalUsedToken.get("inputTokenExecutor") || 0;
        const totalOutput = totalUsedToken.get("outputTokenExecutor") || 0;
        console.log("Input token executor: ", totalInput + response.totalTokens.input);
        console.log("output token executor: ", totalOutput + response.totalTokens.output);
        totalUsedToken.set("inputTokenExecutor", totalInput + response.totalTokens.input)
        totalUsedToken.set("outputTokenExecutor", totalOutput + response.totalTokens.output);

        return parseResponseAgent as ExecuteTaskResult;
    }

    async buildTask(
        agent: AgentAI,
        model: string,
        projectContext: string,
        { text, completedTasks, lastResult }: { text: string, completedTasks: string[], lastResult?: string },
        signal?: AbortSignal
    ) {
        const prompt = buildTaskPrompt({
            goal: text,
            completedTasks,
            lastResult,
            projectContext
        })
        const response = await agent.sendMessage(prompt,
            model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, response.text);

        console.log(response.text);

        const totalInput = totalUsedToken.get("inputTokenPlanning") || 0;
        const totalOutput = totalUsedToken.get("outputTokenPlanning") || 0;

        totalUsedToken.set("inputTokenPlanning", totalInput + response.totalTokens.input)
        totalUsedToken.set("outputTokenPlanning", totalOutput + response.totalTokens.output);

        return parseResponseAgent as BuildTask;
    }

    async getProjectContext(needWorkspace: boolean, providedRoot?: string): Promise<string> {
        let contextOutput = "";
        contextOutput += await this.projectContext.getProjectStructure("", providedRoot, needWorkspace);

        return contextOutput;
    }

    async getWorkspaceTree() {
        return this.projectContext.getWorkspaceTree();
    }

    private isForbiddenDatabaseCommand(command: string): boolean {
        const forbiddenPatterns = [
            /\bphp\s+artisan\s+migrate(?::(?:fresh|refresh|reset|rollback|install))?(?=\s|$)/i,
            /\bphp\s+artisan\s+db:seed\b/i,
            /\b(?:npx\s+)?prisma\s+migrate\s+(?:dev|deploy|reset|resolve)\b/i,
            /\b(?:npx\s+)?prisma\s+db\s+(?:push|seed|execute)\b/i,
            /\b(?:npx\s+)?prisma\s+ migrate\s+diff\b.*--to-(?:url|schema-datasource)/i,
        ];

        return forbiddenPatterns.some(pattern => pattern.test(command));
    }

    async executeResult(item: Operation) {
        const response: { success: boolean, operationResult: OperationResult } & Partial<FailedOperation> = {
            success: true,
            operationResult: {
                status: "DONE",
                summary: "",
                type: item.type,
                timestamp: new Date().toISOString()
            }
        }
        switch (item.type) {
            case "CREATE":
                console.log("CREATE......");
                const operationCreate = await this.fileManager.createFile(item.path, item.content);
                response.operationResult = {
                    summary: `Create ${item.path}`,
                    status: operationCreate.success ? "DONE" : "FAILED",
                    timestamp: new Date().toISOString(),
                    type: "CREATE",
                    ...(!operationCreate.success ? {
                        error: operationCreate.message
                    } : {})
                }
                break;

            case "MODIFY":
                console.log("MODIFY.....")
                for (const change of item.changes) {
                    const modifyFile = await this.fileManager.modifyFile(
                        item.path,
                        change.search,
                        change.replace
                    );
                    response.operationResult = {
                        ...response.operationResult,
                        summary: ` ${item.path}`,
                        status: modifyFile.success ? "DONE" : "FAILED",
                        timestamp: new Date().toISOString(),
                        ...(!modifyFile.success ? {
                            error: modifyFile.message
                        } : {})
                    }
                    if (!modifyFile.success) {
                        response.success = false;
                        response.error = modifyFile;
                        break;
                    }
                }
                break;

            case "DELETE":
                console.log("DELETE.......")
                const operationDelete = await this.fileManager.deleteFile(item.path);
                response.operationResult = {
                    ...response.operationResult,
                    summary: ` ${item.path}`,
                    status: operationDelete.success ? "DONE" : "FAILED",
                    timestamp: new Date().toISOString(),
                    ...(!operationDelete.success ? {
                        error: operationDelete.message
                    } : {})
                }
                break;

            case "COMMAND":
                console.log("COMMAND......");
                const forbidden = this.isForbiddenDatabaseCommand(item.command);
                if (forbidden) break;
                const runCommand = await this.fileManager.runCommand(
                    item.command,
                    item.cwd
                );
                response.operationResult = {
                    ...response.operationResult,
                    summary: `${item.command}`,
                    status: runCommand.success ? "DONE" : "FAILED",
                    timestamp: new Date().toISOString(),
                    ...(!runCommand.success ? {
                        error: runCommand.stdout
                    } : {})
                }
                if (!runCommand.success) {
                    console.error("Error: ", JSON.stringify(runCommand));
                    response.success = false;
                    response.error = runCommand;
                }
                break;
        }
        return {
            ...response,
            operation: item
        }
    }

    parseToObject(agent: AgentAI, model: string, text: string) {
        try {
            const parseObject = this.extractAndParseJSON(agent, model, text);
            return parseObject;
        } catch (err) {
            console.error("Error: ", err);
        }
    }

totalTokens() {
        const totalInputContextBuilder = totalUsedToken.get("inputTokenBuilder") ?? 0;
        const totalOutputContextBuilder = totalUsedToken.get("outputTokenBuilder") ?? 0;
        const totalInputExecutor = totalUsedToken.get("inputTokenExecutor") ?? 0;
        const totalOutputExecutor = totalUsedToken.get("outputTokenExecutor") ?? 0;
        const totalInputPlanning = totalUsedToken.get("inputTokenPlanning") ?? 0;
        const totalOutputPlanning = totalUsedToken.get("outputTokenPlanning") ?? 0;

        const grandTotalInput = totalInputContextBuilder + totalInputExecutor + totalInputPlanning;
        const grandTotalOutput = totalOutputContextBuilder + totalOutputExecutor + totalOutputPlanning;
        const grandTotal = grandTotalInput + grandTotalOutput;

        // Membuat string pesan yang rapi untuk notifikasi VS Code
        const message = `[Token Usage] ` +
            `Builder (In: ${totalInputContextBuilder}, Out: ${totalOutputContextBuilder}) | ` +
            `Executor (In: ${totalInputExecutor}, Out: ${totalOutputExecutor}) | ` +
            `Planning (In: ${totalInputPlanning}, Out: ${totalOutputPlanning}) — ` +
            `GRAND TOTAL: In ${grandTotalInput}, Out ${grandTotalOutput} (Sum: ${grandTotal})`;

        // Menampilkan notifikasi pop-up di pojok kanan bawah VS Code
        vscode.window.showInformationMessage(message);

        // Jika Anda tetap ingin mencatatnya di console (opsional untuk debug)
        console.log("=== TOKEN USAGE REPORT ===");
        console.log(`Context Builder - Input: ${totalInputContextBuilder}, Output: ${totalOutputContextBuilder}`);
        console.log(`Executor        - Input: ${totalInputExecutor}, Output: ${totalOutputExecutor}`);
        console.log(`Planning        - Input: ${totalInputPlanning}, Output: ${totalOutputPlanning}`);
        console.log(`------------------------------`);
        console.log(`GRAND TOTAL     - Input: ${grandTotalInput}, Output: ${grandTotalOutput} (Total: ${grandTotal})`);
    }
}