import * as vscode from 'vscode';

export class ModelService {
    constructor(private readonly globalStorageUri: vscode.Uri) {}

    async saveModelConfig(filename: string, data: any) {
        try {
            const fileUri = vscode.Uri.joinPath(this.globalStorageUri, filename);
            
            const content = new TextEncoder().encode(JSON.stringify(data, null, 2));
            
            await vscode.workspace.fs.writeFile(fileUri, content);
            console.log(`[Storage] Berhasil menyimpan file di: ${fileUri.fsPath}`);
        } catch (error) {
            console.error('[Storage] Gagal menyimpan file konfigurasi:', error);
        }
    }

    // 2. Baca File Konfigurasi dari mana saja
    async readModelConfig(filename: string) {
        try {
            const fileUri = vscode.Uri.joinPath(this.globalStorageUri, filename);
            const fileData = await vscode.workspace.fs.readFile(fileUri);
            
            const jsonString = new TextDecoder().decode(fileData);
            return JSON.parse(jsonString);
        } catch (error) {
            // File belum ada / tidak ditemukan
            return null;
        }
    }
}