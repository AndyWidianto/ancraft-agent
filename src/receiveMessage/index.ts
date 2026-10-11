import { WebviewView } from "vscode";
import { Model, Operation, OperationResult, OutputPlan, StatusTask, Task, TypeProvider } from "../lib/types";

export default class ReceiveMessage {


    receivePlanning(webviewView: WebviewView, planningId: string, planning: OutputPlan) {
        const dataPlanning = {
            ...planning,
            id: planningId,
            steps: planning.steps.map(step => ({ ...step, tasks: [], status: "TODO" as StatusTask }))
        }
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "PLANNING",
            data: dataPlanning
        })
    }

    receiveNewTask(
        webviewView: WebviewView,
        planningId: string,
        stepId: number,
        tasks: Task[]
    ) {
        const dataTask = {
            tasks: tasks.map(task => ({ ...task, status: "TODO" as StatusTask })),
            planningId,
            stepId: stepId
        }
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "NEW_TASKS",
            data: dataTask
        })
    }

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


    receiveUpdateStep(
        webviewView: WebviewView,
        planningId: string,
        stepId: number,
        status: StatusTask
    ) {
        if (!stepId) {
            throw new Error("step id kosong mohon.");
        }
        const dataStep = {
            planningId,
            stepId,
            status
        }
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "UPDATE_STEP",
            data: dataStep
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
        operationId: number,
        status: StatusTask
    ) {
        const dataTask = {
            taskId,
            planningId,
            stepId,
            operationId,
            status
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
        status: StatusTask
    ) {
        const dataTask = {
            taskId,
            planningId,
            stepId,
            status
        }
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "UPDATE_TASK",
            data: dataTask
        })
    }

    receiveModels(
        webviewView: WebviewView,
        data: { provider: TypeProvider, apikey: string, models: Model[] }
    ) {
        webviewView.webview.postMessage({
            command: "RECEIVE_MESSAGE",
            action: "GET_MODELS",
            data: data
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
}