import * as vscode from 'vscode';
import { TechStack } from './types';

export class TechStackManager {

    async buildPromptPlanning(filePath: string) {
        let fullText = "";
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error("Tidak ada workspace yang dibuka.");
        }

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);

        const document = await vscode.workspace.openTextDocument(fileUri);
        fullText = document.getText().trim();
        if (fullText.length > 0) {
            return true;
        }
        return false;
    }

    async validateAndPromptUser(techStack: any, webviewView: vscode.WebviewView): Promise<boolean> {
        const missingFields: string[] = [];


        // Cek bidang mana saja yang nilainya kosong/empty array
        if (!techStack.frontend || techStack.frontend.length === 0) {
            missingFields.push('frontend');
        }
        // if (!techStack.backend || techStack.backend.length === 0) {
        //     missingFields.push('backend');
        // }
        // if (!techStack.state_management || techStack.state_management.length === 0) {
        //     missingFields.push('state_management');
        // }
        // if (!techStack.database || techStack.database.length === 0) {
        //     missingFields.push('database');
        // }

        // Jika ada bidang yang belum diisi, panggil UI Form di Webview
        if (missingFields.length > 0) {
            webviewView.webview.postMessage({
                command: "SHOW_TECH_STACK_QUESTIONNAIRE",
                data: {
                    missingFields: missingFields,
                    currentStack: techStack,
                    options: {
                        // backend: ["NestJS", "Laravel", "Express.js", "Fastify"],
                        // state_management: ["Zustand", "Redux Toolkit", "Pinia", "TanStack Query"],
                        // database: ["PostgreSQL", "MySQL", "MongoDB", "SQLite"],
                        frontend: ["Rect.js/Vite", "Next.js", "Vue"]
                    }
                }
            });

            // Mengembalikan false menandakan proses Agent harus pause sampai user mengisi form
            return false;
        }

        return true; // Stack sudah lengkap
    }
}