import { useState, useEffect, useRef } from 'react';
import type {
  AIModelData,
  ActionType,
  ChatMessage,
  ExecuteTaskMessage,
  ModelState,
  Operation,
  QuestionnaireData,
  Task,
  TechStackData,
  ValidateTaskMessage,
} from './types';
import AgentInput from './components/AgentInput';
import useCommands from './hooks/useCommand';
import { AgentMessage } from './components/AgentMessage';
import { RefreshCw } from 'lucide-react';

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export default function App() {

  const [model, setModel] = useState<ModelState>({
    planning: null,
    executor: null,
    indexing: null,
    context: null,
  });
  const [models, setModels] = useState<AIModelData[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTaskFailed, setIsTaskFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [autoApply, setAutoApply] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [questionnaireSelections, setQuestionnaireSelections] = useState<Record<string, string>>({});
  const [loadingExecuteTask, setLoadingExecuteTask] = useState(false);

  const [taskRightNow, setTaskRightNow] = useState<Task | null>(null);
  const [historyTasks, setHistoryTasks] = useState<Task[]>([]);

  const [cacheValue, setCacheValue] = useState("");

  const [loadingGetModels, setLoadingGetModels] = useState(false);

  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const executingTaskIdRef = useRef<number | string | null>(null);
  const hasExecutedRef = useRef(false);

  const {
    getModels,
    handleStop,
  } = useCommands(vscode, {
    setLoadingGetModels,
    setInputValue,
    setIsLoading,
    cacheValue,
    executingTaskIdRef,
    setMessages,
    setAutoApply,
  })

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setIsAutoScroll(isAtBottom);
  };

  const newTask = (data: Task) => {
    console.log(data);
    setLoadingExecuteTask(true);
    hasExecutedRef.current = false;
    setTaskRightNow(data);
    setMessages(prev => [...prev, {
      sender: "agent",
      id: data.id,
      text: data.task,
      type: data.status,
      timestamp: new Date().toISOString(),
      operations: data.operations ?? []
    }])
  }

  const updateTask = (taskId: string, data: Task) => {
    if (data.status === "DONE") {
      hasExecutedRef.current = false;
      setHistoryTasks(prev => [...prev, data]);
      setLoadingExecuteTask(false);
      setTaskRightNow(null);
    }
    if (taskRightNow) {
      setTaskRightNow(data)
    }
    setMessages(prev => prev.map(p => {
      if (p.id === data.id || p.id === taskId) {
        console.log("Data yang di update: ", p);
        return { ...p, type: data.status }
      }
      return p;
    }));
  }

  const handleFinish = () => {
    setIsLoading(false);
  }

  const newOperation = (taskId: string, data: Operation[]) => {
    setMessages(prev => prev.map(p => p.id === taskId ? ({ ...p, operations: data }) : p))
  }

  useEffect(() => {
    console.log("Messages: ", messages);
    if (isAutoScroll) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isAutoScroll]);

  useEffect(() => {
    if (vscode) {
      vscode.postMessage({
        command: "WEBVIEW_READY"
      })
    }

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command !== 'RECEIVE_MESSAGE' && message.command !== 'NEED_INFORMATION') return;

      const action: ActionType = message.action || (message.command === 'NEED_INFORMATION' ? 'NEED_INFORMATION' : 'TEXT');
      const data = message.data;

      if (action === 'NEED_INFORMATION') {
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            sender: 'system',
            type: 'NEED_INFORMATION',
            questionnaireData: data,
            timestamp: new Date().toISOString()
          }
        ]);
      }

      else if (action === "NEW_TASK") {
        newTask(data);
      }

      else if (action === "UPDATE_TASK") {
        updateTask(message.taskId, data);
      }

      else if (action === "NEW_OPERATION") {
        newOperation(message.taskId, data);
      }

      else if (action === "GET_MODELS") {
        setLoadingGetModels(false);
        const dataItem: AIModelData[] = data;
        setModels(prev => [...prev, ...dataItem]);
      }

      else if (action === "SELECTED_MODEL") {
        setModel(prev => data ? data : prev);
      }

      else if (action === "ERROR") {
        setIsLoading(false);
        setIsTaskFailed(true);
        setErrorMessage(message.message);
      }

      else if (action === "FINISH") {
        handleFinish();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSend = async (value: string, _planning: string, _indexing: string, _executor: string) => {
    if (!value.trim() || isLoading) return;

    const userText = value.trim();
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        sender: 'user',
        text: userText,
        type: 'TEXT',
        timestamp: new Date().toISOString()
      }
    ]);

    setCacheValue(userText);
    setIsLoading(true);

    vscode?.postMessage({
      command: 'SEND_MESSAGE',
      action: "TEXT",
      data: {
        text: userText,
      },
      meta: { ...model.planning, providerId: model.planning?.provider_id }
    });
    hasExecutedRef.current = true;
  };

  const handleQuestionnaireSubmit = (qData: QuestionnaireData, msgId: string) => {
    const updatedTechStack: TechStackData = { ...qData.currentStack };

    qData.questions.forEach((q) => {
      const selectedOption = questionnaireSelections[q.key];
      if (selectedOption) {
        updatedTechStack[q.key] = [selectedOption];
      }
    });

    setMessages((prev) => prev.filter((m) => m.id !== msgId));

    setIsLoading(true);

    const techStackString = Object.entries(updatedTechStack || {})
      .map(([key, val]) => `${key} ${val}`)
      .join(" ");

    const text = [
      cacheValue?.trim(),
      techStackString ? `used ${techStackString}` : ""
    ].filter(Boolean).join("\n");

    vscode?.postMessage({
      command: 'SEND_MESSAGE',
      action: "TEXT",
      data: {
        text: text,
        model: ""
      }
    });
  };

  const handleRetryTask = () => {
    setIsTaskFailed(false);
    setIsLoading(true);
    if (taskRightNow) {
      const executeTask: ExecuteTaskMessage = {
        command: "SEND_MESSAGE",
        action: "EXECUTE_TASK",
        message: {
          text: cacheValue,
          model: model.executor?.model_code || ""
        },
        task: taskRightNow
      };

      vscode?.postMessage(executeTask);
      hasExecutedRef.current = true; // Set lock setelah mengirim
    }
    if (!loadingExecuteTask) {
      const validateTask: ValidateTaskMessage = {
        command: "SEND_MESSAGE",
        action: "VALIDATE_TASK",
        message: {
          text: cacheValue,
          model: model.executor?.model_code || ""
        },
        history: historyTasks.map(m => m.task || "")
      };

      vscode?.postMessage(validateTask);
      hasExecutedRef.current = true; // Set lock setelah mengirim
    }
  }

  const sendSelectedModel = (type: "plan" | "executor" | "indexing" | "context", data: AIModelData) => {
    vscode?.postMessage({
      command: "SELECTED_MODEL",
      data: {
        type: type === "plan" ? "PLANNER" : type === "executor" ? "EXECUTOR" : type === "context" ? "CONTEXT_BUILDER" : "EMBEDDING",
        model: data
      }
    })
  }

  // Badge Warna untuk aksi CUD
  const getActionBadge = (type: ActionType) => {
    switch (type) {
      case 'NEED_INFORMATION':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">INFO NEEDED</span>;
      default:
        return null;
    }
  };

  useEffect(() => {
    if (!isLoading) {
      hasExecutedRef.current = false;
      return;
    }

    if (hasExecutedRef.current) return;

    if (taskRightNow) {
      const executeTask: ExecuteTaskMessage = {
        command: "SEND_MESSAGE",
        action: "EXECUTE_TASK",
        message: {
          text: cacheValue,
          model: model.executor?.model_code || ""
        },
        task: taskRightNow
      };

      vscode?.postMessage(executeTask);
      hasExecutedRef.current = true; // Set lock setelah mengirim
    }
    if (!loadingExecuteTask) {
      const validateTask: ValidateTaskMessage = {
        command: "SEND_MESSAGE",
        action: "VALIDATE_TASK",
        message: {
          text: cacheValue,
          model: model.executor?.model_code || ""
        },
        history: historyTasks.map(m => m.task || "")
      };

      vscode?.postMessage(validateTask);
      hasExecutedRef.current = true; // Set lock setelah mengirim
    }
  }, [isLoading, messages, historyTasks, taskRightNow]);

  return (
    <div className="flex flex-col h-screen text-xs select-none bg-[var(--vscode-sideBar-background)] text-[var(--vscode-sideBar-foreground)] font-sans">
      {/* Message List */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.map((msg) => {

          if (msg.type === 'NEED_INFORMATION' && msg.questionnaireData) {
            const qData = msg.questionnaireData;

            // Validasi apakah semua pertanyaan wajib (required) sudah diisi
            const isAllSelected = qData.questions.every((q: any) =>
              !q.required || questionnaireSelections[q.key]
            );

            return (
              <div
                key={msg.id}
                className="p-3 rounded-lg bg-[var(--vscode-editor-background)] border border-sky-500/40 shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between border-b border-[var(--vscode-widget-border,rgba(255,255,255,0.08))] pb-2">
                  <div className="flex items-center gap-1.5 font-medium text-sky-400">
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm.75-9h-1.5v4.5h1.5V5zm0 5.5h-1.5v1.5h1.5V10.5z" />
                    </svg>
                    <span>Informasi Tambahan Diperlukan</span>
                  </div>
                  {getActionBadge('NEED_INFORMATION')}
                </div>

                <div className="space-y-3">
                  {qData.questions.map((q: any) => (
                    <div key={q.key} className="flex flex-col gap-1.5">
                      <div>
                        <label className="capitalize text-[10px] font-semibold opacity-90 text-[var(--vscode-descriptionForeground)]">
                          {q.title} {q.required && <span className="text-rose-400">*</span>}
                        </label>
                        {q.description && (
                          <p className="text-[9px] opacity-60 leading-tight">{q.description}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {(q.options || []).map((option: any) => {
                          const isSelected = questionnaireSelections[q.key] === option;
                          return (
                            <button
                              key={option}
                              onClick={() =>
                                setQuestionnaireSelections((prev) => ({
                                  ...prev,
                                  [q.key]: option
                                }))
                              }
                              className={`px-2 py-1 rounded text-[10px] border transition-all ${isSelected
                                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent font-medium shadow-sm'
                                : 'bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-[var(--vscode-input-border)] hover:border-[var(--vscode-focusBorder)]'
                                }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  disabled={!isAllSelected}
                  onClick={() => handleQuestionnaireSubmit(qData, msg.id)}
                  className="w-full py-1.5 px-2 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded font-semibold hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-30 disabled:cursor-not-allowed transition-all text-center"
                >
                  Konfirmasi & Lanjutkan
                </button>
              </div>
            );
          }

          if (msg.sender === "agent") {
            return <AgentMessage message={msg} />
          }
          
          return (
            <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[92%] p-2.5 rounded-lg ${msg.sender === 'user' ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]' : 'bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border,rgba(255,255,255,0.08))]'}`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>
            </div>
          );
        })}

        {isTaskFailed && (
          <div className="p-3 mx-3 mb-3 rounded-lg bg-[var(--vscode-editor-background)] border border-rose-500/40 shadow-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-rose-400 text-xs">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                  <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm.75-9h-1.5v4.5h1.5V5zm0 5.5h-1.5v1.5h1.5V10.5z" />
                </svg>
                <span>Task Gagal Dijalankan</span>
              </div>
            </div>

            <p className="text-[11px] text-[var(--vscode-descriptionForeground)] opacity-90">
              {errorMessage || "Terjadi kesalahan pada proses saat ini. Silakan coba lagi."}
            </p>

            {/* Tombol Coba Lagi yang mentrigger fungsi retry otomatis */}
            <button
              onClick={() => handleRetryTask()}
              className="w-full py-1.5 px-2 bg-rose-600 text-white rounded font-semibold hover:bg-rose-700 transition-all text-center text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              try again
            </button>
          </div>
        )}

        {isLoading && !loadingExecuteTask && (
          <div className="flex items-center gap-2 text-[10px] opacity-70 p-2 bg-[var(--vscode-editor-background)] rounded w-fit">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            <span>Agent sedang menyusun instruksi...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Field */}
      <AgentInput
        inputValue={inputValue}
        setInputValue={setInputValue}
        model={model}
        setModel={setModel}
        models={models}
        sendSelectedModel={sendSelectedModel}
        handleStop={handleStop}
        isLoading={isLoading}
        getModels={getModels}
        loadingGetModels={loadingGetModels}
        autoApply={autoApply}
        setAutoApply={setAutoApply}
        onSubmit={handleSend}
      />
    </div>
  );
}