import { OutputPlan, OutputSubPlanning, Operation, OperationResult, AgentAI, SearchRelevantCode, StatusTask, StepType } from "./types";
import { WorkspaceFileManager } from "./file_manager/workspace";
import { buildPromtingPlanning } from "./prompt/planning";
import { buildPromptSubPlanning } from "./prompt/subplanning";
import { buildExecutePrompt } from "./prompt/executor";
import { ExecuteTaskResult, FailedOperation, OperationError } from "./types/operation";
import { buildErrorAnalysisPrompt, buildErrorRecoveryPrompt } from "./prompt/error";
import ProjectContext from "./projectContext";
import { buildSearchPrompt } from "./prompt/build";
import { buildSetupProjectPrompt } from "./prompt/setup";
import { buildJSONRepairPrompt } from "./prompt/buildjsonerror";

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
        console.log("Error handler: ", promptAnalisis);
        const responseAgent = await agent.sendMessage(promptAnalisis, model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, responseAgent.text);

        console.log(responseAgent.text);

        const totalInput = totalUsedToken.get("inputTokenExecutor") || 0;
        const totalOutput = totalUsedToken.get("outputTokenExecutor") || 0;

        console.log("Total Ouput executor: ", responseAgent.totalTokens.output + totalOutput);
        console.log("Total Input executor: ", responseAgent.totalTokens.input + totalInput);
        totalUsedToken.set("inputTokenExecutor", totalInput + responseAgent.totalTokens.input)
        totalUsedToken.set("outputTokenExecutor", totalOutput + responseAgent.totalTokens.output);
        return parseResponseAgent as ExecuteTaskResult;
    }

    async setupProject(agent: AgentAI, model: string, task: string, techStack: any, operationHistory: string, projectContext: string, signal?: AbortSignal) {
        const prompt = buildSetupProjectPrompt({
            task,
            operationHistory,
            projectContext
        })
        console.log("setup project: ", prompt);
        const response = await agent.sendMessage(prompt, model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, response.text);

        console.log(response.text);

        const totalInput = totalUsedToken.get("inputTokenExecutor") || 0;
        const totalOutput = totalUsedToken.get("outputTokenExecutor") || 0;

        console.log("Total Ouput executor: ", response.totalTokens.output + totalOutput);
        console.log("Total Input executor: ", response.totalTokens.input + totalInput);
        totalUsedToken.set("inputTokenExecutor", totalInput + response.totalTokens.input)
        totalUsedToken.set("outputTokenExecutor", totalOutput + response.totalTokens.output);

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
        console.log("Anailisis Error: ", prompt);
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


    // async getAnalisisTeckStack(agent: AgentAI, promptUser: string, model: string, signal?: AbortSignal) {
    //     const promptAnalisis = buildPromptAnalysis(promptUser);
    //     const responseAgent = await agent.sendMessage(promptAnalisis, model, 3, signal);


    //     const totalInput = totalUsedToken.get("inputTokens") || 0;
    //     const totalOutput = totalUsedToken.get("outputTokens") || 0;

    //     console.log(responseAgent.text);
    //     console.log("Total Ouput: ", responseAgent.totalTokens.output + totalOutput);
    //     console.log("Total Input: ", responseAgent.totalTokens.input + totalInput);
    //     totalUsedToken.set("inputTokens", totalInput + responseAgent.totalTokens.input)
    //     totalUsedToken.set("outputTokens", totalOutput + responseAgent.totalTokens.output);

    //     return responseAgent.text;
    // }

    async getPlanning(agent: AgentAI, model: string, text: string, projectContext: string, signal?: AbortSignal) {
        // plannning
        const prompt = buildPromtingPlanning(projectContext, text);
        console.log("Planning: ", prompt);
        const output = await agent.sendMessage(prompt, model, 3, signal);

        console.log(output.text);

        const totalInput = totalUsedToken.get("inputTokenPlanning") || 0;
        const totalOutput = totalUsedToken.get("outputTokenPlanning") || 0;

        console.log("Total Ouput planning: ", output.totalTokens.output + totalOutput);
        console.log("Total Input planning: ", output.totalTokens.input + totalInput);
        totalUsedToken.set("inputTokenPlanning", totalInput + output.totalTokens.input)
        totalUsedToken.set("outputTokenPlanning", totalOutput + output.totalTokens.output);

        const parseOutput: OutputPlan = await this.extractAndParseJSON(agent, model, output.text);
        return parseOutput;
    }

    async getSubPlanning(
        agent: AgentAI,
        model: string,
        projectContext: string,
        goal: string,
        currentStep: string,
        type: StepType,
        previousSteps?: string[],
        nextSteps?: string[],
        signal?: AbortSignal
    ) {
        const promptSubPlanning = buildPromptSubPlanning(
            projectContext,
            goal,
            currentStep,
            type,
            (previousSteps ?? []).join('\n'),
            nextSteps?.join('\n')
        );

        console.log("Sub planning: ", promptSubPlanning);

        const responseAgent = await agent.sendMessage(promptSubPlanning, model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, responseAgent.text);

        console.log(responseAgent.text);

        const totalInput = totalUsedToken.get("inputTokenPlanning") || 0;
        const totalOutput = totalUsedToken.get("outputTokenPlanning") || 0;

        console.log("Total Ouput planning: ", responseAgent.totalTokens.output + totalOutput);
        console.log("Total Input planning: ", responseAgent.totalTokens.input + totalInput);
        totalUsedToken.set("inputTokenPlanning", totalInput + responseAgent.totalTokens.input)
        totalUsedToken.set("outputTokenPlanning", totalOutput + responseAgent.totalTokens.output);

        return parseResponseAgent as OutputSubPlanning;
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

    async Execute(
        agent: AgentAI,
        role: StepType,
        model: string,
        task: string,
        projectContext: string,
        relevantCode: string,
        previousTasks?: string,
        nextTasks?: string,
        operationHistory?: string,
        signal?: AbortSignal
    ) {
        const prompt = buildExecutePrompt({
            role,
            task,
            projectContext,
            relevantCode,
            previousTasks,
            operationHistory,
            nextTasks
        })

        console.log("Execute: ", prompt);

        const response = await agent.sendMessage(prompt,
            model, 3, signal);
        const parseResponseAgent = await this.extractAndParseJSON(agent, model, response.text);

        console.log(response.text);

        const totalInput = totalUsedToken.get("inputTokenExecutor") || 0;
        const totalOutput = totalUsedToken.get("outputTokenExecutor") || 0;

        console.log("Total Ouput executor: ", response.totalTokens.output + totalOutput);
        console.log("Total Input executor: ", response.totalTokens.input + totalInput);
        totalUsedToken.set("inputTokenExecutor", totalInput + response.totalTokens.input)
        totalUsedToken.set("outputTokenExecutor", totalOutput + response.totalTokens.output);

        return parseResponseAgent as ExecuteTaskResult;
    }


    async getProjectContext(needWorkspace: boolean, providedRoot?: string): Promise<string> {
        let contextOutput = "";
        // `=========================================\n`;
        // contextOutput += `PROJECT CONTEXT (ROOT: "${resolvedRoot}")\n`;
        // contextOutput += `=========================================\n`;
        // contextOutput += `Lockfiles: ${detectedLockfiles.length > 0 ? detectedLockfiles.join(', ') : 'None'}\n`;

        // if (foundManifests.length === 0) {
        //     contextOutput += `\n[No package manifest files found in root]\n`;
        //     return contextOutput;
        // }

        // for (const manifest of foundManifests) {
        //     const manifestPath = path.join(resolvedRoot, manifest);
        //     try {
        //         const content = fs.readFileSync(manifestPath, 'utf-8');

        //         if (manifest.endsWith('.json')) {
        //             const parsed = JSON.parse(content);
        //             const sanitized = {
        //                 name: parsed.name || path.basename(resolvedRoot),
        //                 dependencies: parsed.dependencies || {},
        //                 devDependencies: parsed.devDependencies || {},
        //                 scripts: parsed.scripts || {},
        //             };
        //             contextOutput += `\n--- ${manifest} ---\n` + JSON.stringify(sanitized, null, 2) + '\n';
        //         } else {
        //             contextOutput += `\n--- ${manifest} ---\n${content.trim()}\n`;
        //         }
        //     } catch (err) {
        //         contextOutput += `\n[Error reading ${manifest}: ${(err as Error).message}]\n`;
        //     }
        // }

        contextOutput += await this.projectContext.getProjectStructure("", providedRoot, needWorkspace);

        return contextOutput;
    }

    formatPlanning(planning: OutputPlan): string {
        const formatValue = (val: any): string => {
            if (Array.isArray(val)) return val.join(', ');
            if (typeof val === 'object' && val !== null) {
                return Object.entries(val)
                    .map(([k, v]) => `${k}: ${formatValue(v)}`)
                    .join('; ');
            }
            return String(val);
        };

        const goalStr = Object.entries(planning.goal)
            .map(([key, val]) => `${key}: ${val}`)
            .join('\n');

        const contextStr = Object.entries(planning.project_context)
            .map(([key, val]) => `${key}: ${formatValue(val)}`)
            .join('\n');

        return `${goalStr}\n${contextStr}`;
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
}