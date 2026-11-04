import { useState } from "react";
import {
    ChevronDown,
    ChevronRight,
    Check,
    AlertCircle,
    Loader2,
    FileCode2,
    Terminal,
    Trash2,
    Plus,
    Pencil,
    Bot,
    Layers,
    Search,
    FileText,
    HelpCircle,
    BookOpen,
} from "lucide-react";
import type { ChatMessage, Operation } from "../types";

type MessageProps = {
    message: ChatMessage;
};

function getInfoRequestConfig(type: string) {
    switch (type) {
        case "PROJECT_STRUCTURE":
            return { icon: Layers, color: "text-blue-400" };
        case "SEMANTIC_SEARCH":
        case "SYMBOL_SEARCH":
            return { icon: Search, color: "text-purple-400" };
        case "FILE_CONTENT":
        case "FULL_FILE":
            return { icon: FileText, color: "text-emerald-400" };
        case "DEPENDENCY_INFO":
            return { icon: HelpCircle, color: "text-amber-400" };
        case "DOCUMENTATION":
            return { icon: BookOpen, color: "text-sky-400" };
        default:
            return { icon: HelpCircle, color: "text-[var(--vscode-descriptionForeground)]" };
    }
}

export function AgentMessage({ message }: MessageProps) {
    const [expandedOps, setExpandedOps] = useState(false);
    const [expandedInfo, setExpandedInfo] = useState(false);

    const isUser = message.sender === "user";
    const isSystem = message.sender === "system";
    const operations = message.operations ?? [];
    const infoRequests = message.informationRequest ?? [];

    if (isUser) {
        return (
            <div className="flex justify-end py-2">
                <div className="max-w-[90%] rounded-xl bg-[var(--vscode-input-background)] px-3 py-2 text-[12px] leading-relaxed text-[var(--vscode-input-foreground)]">
                    <p className="whitespace-pre-wrap break-words">
                        {message.text}
                    </p>
                </div>
            </div>
        );
    }

    if (isSystem) {
        return (
            <div className="flex items-start gap-2 py-1.5 text-[11px] text-[var(--vscode-descriptionForeground)]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-wrap break-words">
                    {message.text}
                </span>
            </div>
        );
    }

    const isError = message.status === "BLOCKED";
    const isSuccess = message.status === "DONE";
    const isRunning = message.status === "CONTINUE";

    return (
        <div className="group py-2 text-[12px] text-[var(--vscode-editor-foreground)]">
            {/* Agent header */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {isError ? (
                        <AlertCircle className="h-4 w-4 text-[var(--vscode-errorForeground)]" />
                    ) : isSuccess ? (
                        <Check className="h-4 w-4 text-[var(--vscode-testing-iconPassed)]" />
                    ) : isRunning ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--vscode-progressBar-background)]" />
                    ) : (
                        <Bot className="h-4 w-4 text-[var(--vscode-descriptionForeground)]" />
                    )}
                </div>

                <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
                    {message.type.replaceAll("_", " ")}
                </span>

                {/* Badge/Button untuk Information Requests */}
                {infoRequests.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setExpandedInfo(!expandedInfo)}
                        aria-expanded={expandedInfo}
                        className="ml-auto flex items-center gap-1 rounded bg-[var(--vscode-badge-background)] px-1.5 py-0.5 text-[10px] text-[var(--vscode-badge-foreground)] hover:opacity-80"
                    >
                        <HelpCircle className="h-3 w-3" />
                        {infoRequests.length} info requests
                        {expandedInfo ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                    </button>
                )}

                {/* Badge/Button untuk Operations */}
                {operations.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setExpandedOps(!expandedOps)}
                        aria-expanded={expandedOps}
                        className={`${infoRequests.length === 0 ? 'ml-auto' : ''} flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]`}
                    >
                        {operations.length} operations
                        {expandedOps ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                    </button>
                )}
            </div>

            {/* Message content */}
            {message.text && (
                <div className="ml-7 mt-1 whitespace-pre-wrap break-words leading-[1.7]">
                    {typeof message.text === 'object' ? JSON.stringify(message.text, null, 2) : message.text}
                </div>
            )}

            {/* Information Requests List (Expanded) */}
            {expandedInfo && infoRequests.length > 0 && (
                <div className="ml-7 mt-2 space-y-1 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] p-1.5">
                    <div className="px-1 text-[10px] font-semibold text-[var(--vscode-descriptionForeground)]">
                        Information Requests:
                    </div>
                    {infoRequests.map((req) => {
                        const config = getInfoRequestConfig(req.information.type);
                        const Icon = config.icon;

                        // Ambil detail target (path, query, library, atau reason) untuk ditampilkan ringkas
                        const info = req?.information;
                        const infoDetail = info ? (
                            ("path" in info ? info.path : undefined) ??
                            ("query" in info ? info.query : undefined) ??
                            ("library" in info ? info.library : undefined) ??
                            ("reason" in info ? info.reason : undefined) ??
                            ""
                        ) : "";

                        return (
                            <div
                                key={req.id}
                                className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[11px] hover:bg-[var(--vscode-list-hoverBackground)]"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <Icon className={`h-3.5 w-3.5 shrink-0 ${config.color}`} />
                                    <span className="shrink-0 font-medium text-[var(--vscode-editor-foreground)]">
                                        {req.information.type}
                                    </span>
                                    <span className="min-w-0 truncate text-[var(--vscode-descriptionForeground)]">
                                        {infoDetail}
                                    </span>
                                </div>

                                {/* Status badge */}
                                <span className={`shrink-0 rounded px-1 text-[9px] font-semibold ${req.status === 'DONE'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-amber-500/20 text-amber-400 animate-pulse'
                                    }`}>
                                    {req.status}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Operations List (Expanded) */}
            {expandedOps && operations.length > 0 && (
                <div className="ml-7 mt-2 space-y-0.5">
                    {operations.map((operation, index) => {
                        const config = getOperationConfig(operation.type);
                        const Icon = config.icon;

                        return (
                            <div
                                key={`${message.id}-${index}`}
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-[var(--vscode-list-hoverBackground)]"
                            >
                                <Icon className={`h-3.5 w-3.5 shrink-0 ${config.color}`} />

                                <span className="shrink-0 text-[var(--vscode-descriptionForeground)]">
                                    {operation.type}
                                </span>

                                <span className="min-w-0 truncate font-mono text-[var(--vscode-editor-foreground)]">
                                    {"path" in operation
                                        ? String(operation.path)
                                        : "command" in operation
                                            ? String(operation.command)
                                            : "Operation"}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function getOperationConfig(type: Operation["type"]) {
    switch (type) {
        case "CREATE":
            return {
                icon: Plus,
                color: "text-[var(--vscode-gitDecoration-addedResourceForeground)]",
            };

        case "MODIFY":
            return {
                icon: Pencil,
                color: "text-[var(--vscode-gitDecoration-modifiedResourceForeground)]",
            };

        case "DELETE":
            return {
                icon: Trash2,
                color: "text-[var(--vscode-gitDecoration-deletedResourceForeground)]",
            };

        case "COMMAND":
            return {
                icon: Terminal,
                color: "text-[var(--vscode-descriptionForeground)]",
            };

        default:
            return {
                icon: FileCode2,
                color: "text-[var(--vscode-descriptionForeground)]",
            };
    }
}