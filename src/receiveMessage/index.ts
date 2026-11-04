import { WebviewView } from "vscode";
import { AIModelData, InformationRequest, Operation, OperationResult, StatusTask } from "../lib/types";
import { v4 as uuid } from "uuid";

export default class ReceiveMessage {

    receiveNewHistory(
        webviewView: WebviewView,
        operationResult: OperationResult
    ) {
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "NEW_HISTORY",
            data: operationResult
        })
    }

    receiveOperations(
        webviewView: WebviewView,
        planningId: string,
        stepId: number,
        taskId: number,
        operations: Operation[]
    ) {
        const dataTask = {
            taskId,
            planningId,
            stepId,
            operations: operations.map(operation => ({ ...operation, status: "TODO" as StatusTask }))
        }
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "NEW_OPERATION",
            data: dataTask
        })
    }

    receiveUpdateOperation(
        webviewView: WebviewView,
        planningId: string,
        stepId: number,
        taskId: number,
        status: StatusTask,
        operationId: number,
        operation?: Operation,
        error?: any,
    ) {
        const dataTask = {
            taskId,
            planningId,
            stepId,
            operation,
            operationId,
            status,
            error
        }
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "UPDATE_OPERATION",
            data: dataTask
        })
    }

    receiveUpdateTask(
        webviewView: WebviewView,
        planningId: string,
        stepId: number,
        taskId: number,
        status: StatusTask,
        result_search: { context: string[], history_query: string[] }
    ) {
        const dataTask = {
            taskId,
            planningId,
            stepId,
            status,
            result_search
        }
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "UPDATE_TASK",
            data: dataTask
        })
    }

    receiveModels(
        webviewView: WebviewView,
        data: AIModelData[],
        type?: string
    ) {
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "GET_MODELS",
            data: data,
            type
        })
    }

    receiveMessageSelectedModel(
        webviewView: WebviewView,
        data: { indexing: AIModelData | null, planning: AIModelData | null, executor: AIModelData | null },
        type?: string
    ) {
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "SELECTED_MODEL",
            data: data,
        })
    }

    receiveError(
        webviewView: WebviewView,
        data: any
    ) {
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "ERROR",
            data: data
        })
    }

    requestInformation(
        webviewView: WebviewView,
        taskId: string,
        id: string,
        data: InformationRequest,
        status: "DONE" | "IN_PROGRESS"
    ) {
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "REQUEST_INFORMATION",
            data: {
                id,
                information: data,
                status
            },
            taskId
        })
    }
}