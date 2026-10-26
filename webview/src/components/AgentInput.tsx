import { useEffect, useRef, useState } from 'react';
import type { AIModelData, ModelState, TypeProvider } from '../types';
import { Loader2, Square } from 'lucide-react';


export interface AgentInputProps {
  inputValue: string;
  sendSelectedModel: (type: "plan" | "executor" | "indexing" | "context", data: AIModelData) => void
  setInputValue: (value: string) => void;
  isLoading: boolean;
  setModel: React.Dispatch<React.SetStateAction<ModelState>>
  model: ModelState
  onSubmit: (value: string, planning: string, indexingModel: string, executorModel: string) => void;
  autoApply: boolean;
  handleStop: () => void;
  models: AIModelData[]
  loadingGetModels: boolean;
  setAutoApply: (state: boolean) => void;
  getModels: ({ provider, apikey }: { provider: TypeProvider, apikey: string }) => void;
}

export default function AgentInput({
  handleStop,
  isLoading,
  onSubmit,
  autoApply,
  sendSelectedModel,
  setModel,
  setAutoApply,
  models,
  getModels,
  loadingGetModels,
  model,
  inputValue,
  setInputValue
}: AgentInputProps) {


  // State Modal Provider & API Keys
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [provider, setProvider] = useState<TypeProvider>("GEMINI");
  const [apiKey, setApiKey] = useState("");

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    onSubmit(inputValue, "", "", "");
    setInputValue('');
  };

  const handleChange = (type: "plan" | "executor" | "indexing" | "context", modelId: string) => {
    const findModel = models.find(m => m.id === Number(modelId));
    if (findModel) {
      setModel(prev => ({
        ...prev,
        ...(type === "plan" ? { planning: findModel } : type === "executor" ? { executor: findModel } : type === "context" ? { context: findModel } : { indexing: findModel })
      }));
      sendSelectedModel(type, findModel);
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height terlebih dahulu agar tinggi bisa mengecil saat teks dihapus
      textarea.style.height = 'auto';
      // Set tinggi sesuai konten scrollHeight
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputValue]);

  return (
    <div className="p-2 border-t border-[var(--vscode-sideBar-border,rgba(255,255,255,0.08))] text-xs text-[var(--vscode-foreground)] relative">
      <div className="flex flex-col gap-2 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded p-2">

        {/* Dropdown Select Model untuk Indexing, Planning, dan Executor */}
        <div className="grid grid-cols-3 gap-1 pb-1.5 border-b border-[var(--vscode-sideBar-border,rgba(255,255,255,0.08))]">

          {/* Indexing Model */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-[var(--vscode-descriptionForeground)] font-medium truncate" title="Indexing Model">
              Indexing Model
            </label>
            <select
              value={model.indexing?.id || ""}
              onChange={(e) => handleChange("indexing", e.target.value)}
              className="bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border,transparent)] rounded text-[10px] p-0.5 outline-none truncate"
            >
              {models.length > 0 ? models.filter(model => model.type === "EMBEDDING").map((m, i) => (
                <option key={i} value={m.id}>
                  {m.model_name}
                </option>
              )) : ''}
            </select>
          </div>

          {/* Planning Model */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-[var(--vscode-descriptionForeground)] font-medium truncate" title="Planning Model">
              Planning Model
            </label>
            <select
              value={model.planning?.id || ""} // Ubah dari model_name ke id
              onChange={(e) => handleChange("plan", e.target.value)}
              className="bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border,transparent)] rounded text-[10px] p-0.5 outline-none truncate"
            >
              <option value="" disabled>Pilih Planning Model</option>
              {models.length > 0 ? models.filter(m => m.type === "LLM").map((m, i) => (
                <option key={m.id || i} value={m.id}>
                  {m.model_name} (provider {m.provider_id})
                </option>
              )) : ''}
            </select>
          </div>

          {/* Executor Model */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-[var(--vscode-descriptionForeground)] font-medium truncate" title="Executor Model">
              Executor Model
            </label>
            <select
              value={model.executor?.id || ""} // Ubah dari model_name ke id
              onChange={(e) => handleChange("executor", e.target.value)}
              required
              className="bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border,transparent)] rounded text-[10px] p-0.5 outline-none truncate"
            >
              <option value="" disabled>Pilih Executor Model</option>
              {models.length > 0 ? models.filter(m => m.type === "LLM").map((m, i) => (
                <option key={m.id || i} value={m.id}>
                  {m.model_name} (provider {m.provider_id})
                </option>
              )) : ''}
            </select>
          </div>

          {/* Executor Model */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-[var(--vscode-descriptionForeground)] font-medium truncate" title="Executor Model">
              Context Builder Model
            </label>
            <select
              value={model.context?.id || ""}
              onChange={(e) => handleChange("context", e.target.value)}
              required
              className="bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border,transparent)] rounded text-[10px] p-0.5 outline-none truncate"
            >
              <option value="" disabled>Pilih Context Model</option>
              {models.length > 0 ? models.filter(m => m.type === "LLM").map((m, i) => (
                <option key={m.id || i} value={m.id}>
                  {m.model_name} (provider {m.provider_id})
                </option>
              )) : ''}
            </select>
          </div>

        </div>

        {/* Textarea Input */}
        <textarea
          ref={textareaRef}
          rows={2}
          className="w-full bg-transparent text-[var(--vscode-input-foreground)] outline-none text-xs resize-none placeholder-[var(--vscode-input-placeholderForeground)] max-h-32 overflow-y-auto"
          placeholder="Instruksikan Agent..."
          value={inputValue}
          required
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {/* Button Settings Provider */}
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-[var(--vscode-button-secondaryBackground,rgba(255,255,255,0.05))] text-[var(--vscode-button-secondaryForeground,#fff)] hover:bg-[var(--vscode-button-secondaryHoverBackground,rgba(255,255,255,0.1))] rounded border border-[var(--vscode-sideBar-border,rgba(255,255,255,0.1))]"
            >
              <span>⚙️ Provider</span>
            </button>

            {/* Checkbox Auto Apply */}
            <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]">
              <input
                type="checkbox"
                checked={autoApply}
                onChange={(e) => setAutoApply(e.target.checked)}
                className="accent-[var(--vscode-button-background)] cursor-pointer rounded-sm"
              />
              <span>Auto Apply</span>
            </label>
          </div>

          {!isLoading ? (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || models.length === 0 || (!model.executor || !model.planning)}
              className="px-3 py-1 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded font-semibold text-[10px] disabled:opacity-30"
            >
              Kirim
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-3 py-1 bg-[var(--vscode-button-secondaryBackground,rgba(255,255,255,0.1))] text-[var(--vscode-button-secondaryForeground,#fff)] hover:bg-[var(--vscode-button-secondaryHoverBackground,rgba(255,255,255,0.2))] rounded font-semibold text-[10px] flex items-center justify-center gap-1"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal Settings Provider */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--vscode-editor-background,#1e1e1e)] border border-[var(--vscode-widget-border,rgba(255,255,255,0.1))] w-full max-w-xs rounded-lg shadow-xl p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-[var(--vscode-sideBar-border,rgba(255,255,255,0.08))] pb-2">
              <h3 className="font-semibold text-xs text-[var(--vscode-foreground)]">Pengaturan Provider</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)]">Pilih Active Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as TypeProvider)}
                className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded p-1.5 text-xs outline-none"
              >
                <option value="GEMINI">AISTUDIO (Google)</option>
                <option value="OPENAI">OPENAI</option>
                <option value="ANTHROPIC">ANTHROPIC (Claude)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                API Key ({provider})
              </label>
              <input
                type="password"
                placeholder={`Masukkan API Key ${provider}...`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded p-1.5 text-xs outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => getModels({ provider: provider, apikey: apiKey })}
                disabled={loadingGetModels}
                className="px-3 py-1 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 min-w-[60px]"
              >
                {loadingGetModels ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Memuat...</span>
                  </>
                ) : (
                  'Simpan'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}