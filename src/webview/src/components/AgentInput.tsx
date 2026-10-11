import { useEffect, useRef, useState } from 'react';
import type { Agent, TypeProvider } from '../types';
import { Loader2, Square } from 'lucide-react';


export interface AgentInputProps {
  isLoading: boolean;
  model: { planning: string, executor: string, indexing: string }
  onSubmit: (value: string, planning: string, indexingModel: string, executorModel: string) => void;
  autoApply: boolean;
  handleStop: () => void;
  agents: Agent[]
  loadingGetModels: boolean;
  setAutoApply: (state: boolean) => void;
  onChangeModel: (type: "plan" | "executor" | "indexing", value: string) => void;
  getModels: ({ provider, apikey }: { provider: TypeProvider, apikey: string }) => void;
}

export default function AgentInput({ handleStop, isLoading, onSubmit, autoApply, setAutoApply, agents, getModels, loadingGetModels, onChangeModel, model }: AgentInputProps) {
  const [inputValue, setInputValue] = useState('');


  // State Modal Provider & API Keys
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [provider, setProvider] = useState<TypeProvider>("GEMINI");
  const [apiKey, setApiKey] = useState("");

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    onSubmit(inputValue, model.planning, model.indexing, model.executor);
    setInputValue('');
  };

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
              value={model.indexing}
              onChange={(e) => onChangeModel("indexing", e.target.value)}
              className="bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border,transparent)] rounded text-[10px] p-0.5 outline-none truncate"
            >
              {agents.length > 0 ? agents.map(agent => (
                agent.models.filter(model => model.isEmbedding).map((m, i) => (
                  <option key={i} value={m.code_name}>
                    {m.name}
                  </option>
                )))
              ) : ''}
            </select>
          </div>

          {/* Planning Model */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-[var(--vscode-descriptionForeground)] font-medium truncate" title="Planning Model">
              Planning Model
            </label>
            <select
              value={model.planning}
              onChange={(e) => onChangeModel("plan", e.target.value)}
              className="bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border,transparent)] rounded text-[10px] p-0.5 outline-none truncate"
            >
              {agents.length > 0 ? agents.map(agent => (
                agent.models.filter(model => model.isChat).map((m, i) => (
                  <option key={i} value={m.code_name}>
                    {m.name}
                  </option>
                )))
              ) : ''}
            </select>
          </div>

          {/* Executor Model */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-[var(--vscode-descriptionForeground)] font-medium truncate" title="Executor Model">
              Executor Model
            </label>
            <select
              value={model.executor}
              onChange={(e) => onChangeModel("executor", e.target.value)}
              className="bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border,transparent)] rounded text-[10px] p-0.5 outline-none truncate"
            >
              {agents.length > 0 ? agents.map(agent => (
                agent.models.filter(model => model.isChat).map((m, i) => (
                  <option key={i} value={m.code_name}>
                    {m.name}
                  </option>
                )))
              ) : ''}
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
              disabled={!inputValue.trim() || agents.length === 0}
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