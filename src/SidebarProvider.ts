import * as vscode from "vscode";
import { BackgroundMessage } from "./lib/types";
import ActionService from "./action";
import { ModelService } from "./model";
import ReceiveMessage from "./receiveMessage";


export class SidebarProvider implements vscode.WebviewViewProvider {

    private currentAbortController: AbortController | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly action: ActionService,
        private readonly modelService: ModelService,
        private readonly receiveMessage: ReceiveMessage
    ) { }


    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken): Thenable<void> | void {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        }
        webviewView.webview.html = this.getHtmlForView(webviewView.webview);


        webviewView.webview.onDidReceiveMessage(async (data: BackgroundMessage) => {
            try {
                console.log("Chat User: ", data);

                if (data.command === "WEBVIEW_READY") {
                    await this.action.readModels(webviewView);
                    
                }
                if (data.command === "ABORT_REQUEST") {
                    if (this.currentAbortController) {
                        this.currentAbortController.abort();
                        this.currentAbortController = null;
                    }
                }

                if (data.command === "SELECTED_MODEL") {
                    await this.action.selectedModel({ type: data.data?.type || "PLANNER", model: data.data?.model });
                }
                if (data.command === "SEND_MESSAGE") {
                    if (this.currentAbortController) {
                        this.currentAbortController.abort();
                    }

                    this.currentAbortController = new AbortController();
                    const signal = this.currentAbortController.signal;

                    switch (data.action) {
                        case "GET_MODELS": {
                            await this.action.getModels(data.data.provider, data.data.apikey, webviewView, this.modelService);
                            break;
                        }
                        case "EXECUTE_STEP": {
                            await this.action.executeStep(webviewView, data, signal);
                            break;
                        }
                        case "EXECUTE_TASK": {
                            await this.action.executeTask(webviewView, data, signal);
                            break;
                        }
                        case "TEXT": {
                            await this.action.getPlanning(webviewView, data, signal);
                            break;
                        }
                        case "EXECUTE_OPERATION": {
                            await this.action.executeOperation(webviewView, data, signal);
                            break;
                        }
                        case "EXECUTE_OPERATION_FAILED": {
                            await this.action.resloveError(webviewView, data, signal);
                            break;
                        }
                    }
                    //await this.sendMessage(webviewView, data);
                }
            } catch (err) {
                this.receiveMessage.receiveError(webviewView, { ...data, data: { ...(data as any).data, status: "TODO" } })
                console.error("Error: ", err);
            }
        })
    }


    private getHtmlForView(webview: vscode.Webview) {
        // Buat URI khusus untuk Script JS dan Style CSS dari folder dist webview
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.js')
        );

        // Pastikan nama file CSS ini sesuai dengan hasil build Vite kamu (misal: index.css)
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'assets', 'index.css')
        );

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <!-- Mencegah CSP memblokir Style & Script -->
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <!-- 3. MASUKKAN LINK CSS DI SINI -->
        <link href="${styleUri}" rel="stylesheet" />
        
        <title>Sidebar Chat</title>
        </head>
        <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

}