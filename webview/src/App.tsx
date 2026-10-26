import { useState, useEffect, useRef } from 'react';
import type {
  AIModelData,
  ActionType,
  ChatMessage,
  ExecuteStepData,
  ModelState,
  Operation,
  OperationResult,
  PlanningMessageData,
  QuestionnaireData,
  TechStackData,
} from './types';
//import { mockMessages } from './data/mockup';
import AgentInput from './components/AgentInput';
import { Loader2 } from 'lucide-react';
import useCommands from './hooks/useCommand';

export interface RefreshActionItem {
  action: string;
  data: any;
  refreshAt: Date;
  planningId: string;
  operationId: number;
}

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export default function App() {

  const [model, setModel] = useState<ModelState>({
    planning: null,
    executor: null,
    indexing: null,
    context: null,
  });
  const [models, setModels] = useState<AIModelData[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [loadingOperation, setLoadingOperation] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [autoApply, setAutoApply] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [questionnaireSelections, setQuestionnaireSelections] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<OperationResult[]>([]);

  const [cacheValue, setCacheValue] = useState("");

  const [loadingGetModels, setLoadingGetModels] = useState(false);

  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const executingTaskIdRef = useRef<number | string | null>(null);

  const {
    getModels,
    handleStop,
    getPlanning,
    getOperations,
    getTasks,
    updateStatusOperation,
    updateStatusStep,
    updateStatusTask,
    handleError
  } = useCommands(vscode, {
    setLoadingGetModels,
    setInputValue,
    setIsLoading,
    cacheValue,
    executingTaskIdRef,
    setMessages,
    setLoadingOperation,
    setAutoApply,
  })

  function formatPlanning(planning?: PlanningMessageData): string {
    if (!planning) return "";
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

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setIsAutoScroll(isAtBottom);
  };

  useEffect(() => {
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

      // Inisialisasi Planning Baru
      if (action === 'PLANNING') {
        setIsLoading(false);
        getPlanning(data);
      }

      // Menerima Daftar Tasks Baru untuk Step Tertentu
      else if (action === 'NEW_TASKS') {
        getTasks(data);
      }

      // Menerima Operations Baru untuk Task Tertentu
      else if (action === 'NEW_OPERATION') {
        getOperations(data);
      }
      // Handler pesan masuk dari VS Code Background
      if (action === 'UPDATE_OPERATION') {
        updateStatusOperation(data);
      }

      else if (action === 'UPDATE_STEP') {
        updateStatusStep(data);
      }

      // Update Status Task (TODO / IN_PROGRESS / DONE)
      else if (action === 'UPDATE_TASK') {
        updateStatusTask(data);
      }

      else if (action === 'NEED_INFORMATION') {
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

      else if (action === "NEW_HISTORY") {
        setHistory(prev => [...prev, data]);
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
        handleError(data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);


  const executingOperationIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    const lastPlanningMsg = [...messages].reverse().find((m) => m.type === 'PLANNING' && m.planning);
    if (!lastPlanningMsg || !lastPlanningMsg.planning) return;


    const planning = lastPlanningMsg.planning;

    if (planning.status === "FAILED") return;


    const goal = formatPlanning(planning);

    let finished = true;

    for (const [index, step] of planning.steps.entries()) {
      if (step.status === "IN_PROGRESS" || step.status === "FAILED") break;

      const provSteps = planning.steps.slice(0, index).map(s => s.description || "").slice(-2);
      const nextSteps = planning.steps.slice(index + 1).map(s => s.description || "").slice(-2);

      const dataExecute: ExecuteStepData = {
        goal,
        step: step.description || "",
        stepId: step.id,
        planningId: planning.id,
        type: step.type,
        nextTasks: nextSteps,
        previousTasks: provSteps
      }

      if (step.tasks.length === 0) {
        if (!loadingOperation) {
          vscode?.postMessage({
            command: "SEND_MESSAGE",
            action: "EXECUTE_STEP",
            data: dataExecute,
            history,
            meta: { ...model.planning, providerId: model.planning?.provider_id }
          });
        }
        finished = false;
        console.log("Berhenti di execute step")
        break;
      }

      let isStepCompleted = true;

      for (const [indexTask, task] of step.tasks.entries()) {
        if (task.status === "IN_PROGRESS" || task.status === "FAILED") {
          isStepCompleted = false;
          finished = false;
          console.log("Berhenti karena task masih dalam progress: ", task.title);
          break;
        }

        if (task.status === "TODO") {
          isStepCompleted = false;

          const executeTaskId = `step:${step.id}:${task.id}`;
          if (executingTaskIdRef.current !== executeTaskId && !loadingOperation) {
            executingTaskIdRef.current = executeTaskId;

            const provTasks = step.tasks.slice(0, indexTask).map(task => task.description).slice(-2);
            const nextTasks = step.tasks.slice(indexTask + 1).map(task => task.description).slice(-2);

            vscode?.postMessage({
              command: "SEND_MESSAGE",
              action: "EXECUTE_TASK",
              data: {
                goal,
                task: task.description || step.description,
                stepId: step.id,
                taskId: task.id,
                planningId: planning.id,
                type: step.type,
                nextTasks: nextTasks,
                previousTasks: provTasks,
              },
              history,
              meta: { ...model.executor, providerId: model.executor?.provider_id, embedding: { ...model.indexing, providerId: model.indexing?.provider_id } }
            });
            finished = false;
            break;
          }
        }

        if (task.status === "DONE" && task.operations && task.operations.length > 0) {

          const todoOpIsAvaliable = task.operations.some(op => op.status === "TODO");
          let isTaskCompleted = true;

          if (todoOpIsAvaliable) {
            if (!autoApply) {
              isStepCompleted = false;
              break;
            }
            for (const operation of task.operations) {
              if (operation.status === "DONE") continue;

              if (operation.status === "IN_PROGRESS") {
                isTaskCompleted = false;
                break;
              }

              const executingOperationId = `operation:${step.id}:${task.id}:${operation.id}`;

              if (operation.status === "TODO") {
                if (executingOperationIdRef.current === executingOperationId) {
                  isTaskCompleted = false;
                  break;
                }

                executingOperationIdRef.current = executingOperationId;

                const dataExecute = {
                  planningId: planning.id,
                  stepId: step.id,
                  taskId: task.id,
                  operationId: operation.id,
                  operation: operation
                };

                vscode?.postMessage({
                  command: 'SEND_MESSAGE',
                  action: "EXECUTE_OPERATION",
                  data: dataExecute,
                  history,
                  meta: { ...model.executor, providerId: model.executor?.provider_id, embedding: { ...model.indexing, providerId: model.indexing?.provider_id } }
                });

                setTaskId(`planning:${planning.id}:${step.id}:${task.id}`);
                setLoadingOperation(true);
                isTaskCompleted = false;
                break;
              }
            }
          }

          if (!isTaskCompleted) {
            isStepCompleted = false;
            finished = false;
            break;
          }
        }
      }

      if (!isStepCompleted) {
        finished = false;
        break;
      }
    }

    if (finished) {
      setMessages(prev => prev.map(message => message.id === lastPlanningMsg.id ? ({
        ...message,
        planning: message.planning ? {
          ...message.planning,
          status: "DONE"
        } : undefined
      }) : message));
    }
  }, [messages, autoApply]);

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
      history,
      meta: { ...model.planning, providerId: model.planning?.provider_id }
    });
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
      },
      history
    });
  };

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

  const handleRetryPlan = (_id: string) => {
    console.log("Waadduh maaf untuk fitur ini masih dalam pengembangan jadi tunggu yah :) see you");
  }

  const handleRetryStep = (planId: string, stepId: number) => {
    messages.forEach(message => {
      if (message.planning) {
        const planning = message.planning;
        const goal = formatPlanning(planning);
        if (planning.id === planId) {
          planning.steps.forEach((step, index) => {
            if (step.id === stepId) {

              const provSteps = planning.steps.slice(0, index).map(s => s.description || "").slice(-2);
              const nextSteps = planning.steps.slice(index + 1).map(s => s.description || "").slice(-2);

              const dataExecute: ExecuteStepData = {
                goal,
                step: step.description || "",
                stepId: step.id,
                planningId: planning.id,
                type: step.type,
                nextTasks: nextSteps,
                previousTasks: provSteps
              }
              if (!loadingOperation) {
                vscode?.postMessage({
                  command: "SEND_MESSAGE",
                  action: "EXECUTE_STEP",
                  data: dataExecute,
                  history,
                  meta: { ...model.planning, providerId: model.planning?.provider_id }
                });
              }
            }
          })
        }
      }
    })
  }

  const handleRetryTask = (planId: string, stepId: number, taskId: number) => {
    messages.forEach(message => {
      if (message.planning) {
        const planning = message.planning;
        const goal = formatPlanning(planning);
        if (planning.id === planId) {
          planning.steps.forEach(step => {
            if (step.id === stepId) {
              step.tasks.forEach((task, indexTask) => {
                if (task.id === taskId) {
                  const provTasks = step.tasks.slice(0, indexTask).map(task => task.description).slice(-2);
                  const nextTasks = step.tasks.slice(indexTask + 1).map(task => task.description).slice(-2);

                  vscode?.postMessage({
                    command: "SEND_MESSAGE",
                    action: "EXECUTE_TASK",
                    data: {
                      goal,
                      task: task.description || step.description,
                      stepId: step.id,
                      taskId: task.id,
                      planningId: planning.id,
                      type: step.type,
                      nextTasks: nextTasks,
                      previousTasks: provTasks,
                    },
                    history,
                    meta: { ...model.executor, providerId: model.executor?.provider_id, embedding: { ...model.indexing, providerId: model.indexing?.provider_id } }
                  });
                }
              })
            }
          })
        }
      }
    })
  }

  // const handleResolveOperation = (_stepId: number, _taskId: number, _op: Operation) => {

  // }

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
          if (msg.type === 'PLANNING' && msg.planning) {
            const plan = msg.planning;

            // Helper renderer badge tipe aksi Operation
            const renderOpBadge = (type: string) => {
              switch (type) {
                case 'CREATE':
                  return <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">CREATE</span>;
                case 'MODIFY':
                case 'UPDATE':
                  return <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">MODIFY</span>;
                case 'DELETE':
                  return <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">DELETE</span>;
                case 'COMMAND':
                  return <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shrink-0">EXEC</span>;
                default:
                  return null;
              }
            };

            // Handler manual saat pengguna menekan tombol Apply pada Operation
            const handleApplyOperation = (stepId: number, taskId: number, operation: Operation) => {
              const dataExecute = {
                planningId: plan.id,
                stepId,
                taskId,
                operationId: operation.id,
                operation: operation
              }
              vscode?.postMessage({
                command: 'SEND_MESSAGE',
                action: "EXECUTE_OPERATION",
                data: dataExecute,
                history,
                meta: { ...model.executor, providerId: model.executor?.provider_id, embedding: { ...model.indexing, providerId: model.indexing?.provider_id } }
              });
            };

            const handleResolveOperation = (stepId: number, taskId: number, operation: Operation) => {
              const dataExecute = {
                planningId: plan.id,
                stepId,
                taskId,
                operationId: operation.id,
                operation: operation
              }
              vscode?.postMessage({
                command: 'SEND_MESSAGE',
                action: "EXECUTE_OPERATION_FAILED",
                data: dataExecute,
                history,
                meta: { ...model.executor, providerId: model.executor?.provider_id, embedding: { ...model.indexing, providerId: model.indexing?.provider_id } }
              });
            }

            return (
              <div key={msg.id} className="w-full space-y-2.5 py-1 text-[11px] bg-transparent">
                {plan.status === 'FAILED' && (
                  <div className="p-3 rounded bg-rose-950/30 border border-rose-500/40 flex items-center justify-between gap-2">
                    <div className="text-xs text-rose-200 font-medium">
                      ⚠️ Proses gagal dijalankan. Silakan coba proses ulang.
                    </div>
                    <button
                      onClick={() => handleRetryPlan(plan.id)}
                      className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[10px] transition-all shadow-sm cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <span>🔄</span> Process Ulang
                    </button>
                  </div>
                )}

                {(plan.status === 'IN_PROGRESS' || plan.status === 'TODO') && (
                  <div className="p-3 rounded bg-amber-950/20 border border-amber-500/30 flex items-center justify-between gap-2">
                    <div className="text-xs text-amber-200/90 font-medium flex items-center gap-1.5">
                      <span className="animate-spin">⏳</span> Proses sedang berjalan...
                    </div>
                    <button
                      onClick={() => handleStop()}
                      className="px-3 py-1 rounded bg-zinc-700 hover:bg-red-600/80 text-white font-semibold text-[10px] transition-all shadow-sm cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <span>⏹️</span> Hentikan Proses
                    </button>
                  </div>
                )}

                {/* Goal Header */}
                <div className="pb-1 border-b border-[var(--vscode-widget-border,rgba(255,255,255,0.08))]">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-400">
                    <span className="text-[12px]">🎯</span>
                    <span>{plan.goal.title}</span>
                  </div>
                  {plan.goal.description && (
                    <p className="text-[10px] opacity-60 mt-0.5 leading-relaxed">{plan.goal.description}</p>
                  )}
                </div>

                <div className="space-y-2">
                  {plan.steps.map((step) => {
                    // Hanya tampilkan task yang aktif atau sudah jalan/selesai (Queue flow)
                    const activeTasks = step.tasks.filter((task) => task.status !== 'TODO');

                    if (step.status === "TODO") return null;


                    // Deteksi apakah Step mengalami gagal (FAILED)
                    const isStepFailed = step.status === 'FAILED';

                    return (
                      <div key={step.id} className="space-y-1.5 pl-1">
                        <div className="font-semibold text-[10px] text-sky-400/90 flex items-center justify-between w-full">
                          <div className="flex items-center gap-1">
                            {/* <span>Step {step.id}:</span> */}
                            <span className="opacity-90">{step.title}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {step.status === "IN_PROGRESS" && (
                              <div className="flex items-center gap-1 text-sky-400">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span className="text-[9px] lowercase italic opacity-90">running...</span>
                              </div>
                            )}

                            {/* Tombol Try Again untuk Step jika FAILED */}
                            {isStepFailed && (
                              <button
                                onClick={() => handleRetryStep(plan.id, step.id)}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[8px] transition-all shadow-sm cursor-pointer flex items-center gap-1"
                              >
                                <span>🔄</span>
                                <span>Try Again</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Tasks List */}
                        <div className={`space-y-1.5 pl-2 border-l ${isStepFailed ? 'border-rose-500/60' : 'border-[var(--vscode-widget-border,rgba(255,255,255,0.1))]'}`}>
                          {activeTasks.map((task, indexTask) => {
                            const isTaskRunning = task.status === 'IN_PROGRESS';
                            const isTaskDone = task.status === 'DONE';
                            const isTaskFailed = task.status === 'FAILED'; // Deteksi status FAILED pada Task
                            const operations = task.operations || [];

                            const handleRefreshTask = () => {
                              const goal = formatPlanning(plan);
                              const provTasks = step.tasks.slice(0, indexTask).map(task => task.description).slice(-2);
                              const nextTasks = step.tasks.slice(indexTask + 1).map(task => task.description).slice(-2);
                              const dataExecute = {
                                goal,
                                task: task.description || step.description,
                                stepId: step.id,
                                taskId: task.id,
                                planningId: plan.id,
                                type: step.type,
                                nextTasks: nextTasks,
                                previousTasks: provTasks,
                              }

                              vscode?.postMessage({
                                command: "SEND_MESSAGE",
                                action: "EXECUTE_TASK",
                                data: dataExecute,
                                history,
                                meta: { ...model.executor, providerId: model.executor?.provider_id, embedding: { ...model.indexing, providerId: model.indexing?.provider_id } }
                              });
                            }

                            const isOperationRunning = loadingOperation && taskId === `planning:${plan.id}:${step.id}:${task.id}`;

                            return (
                              <div
                                key={task.id}
                                className={`p-2 rounded transition-all space-y-2 border ${isTaskFailed
                                  ? 'bg-rose-950/20 border-rose-500/60'
                                  : isTaskRunning || isOperationRunning
                                    ? 'bg-indigo-950/20 border-indigo-500/40'
                                    : 'bg-[var(--vscode-editor-background)] border-[var(--vscode-widget-border,rgba(255,255,255,0.06))]'
                                  }`}
                              >
                                {/* Task Header */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 font-medium min-w-0">
                                    {isTaskRunning || isOperationRunning ? (
                                      <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                    ) : isTaskDone ? (
                                      <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                    ) : isTaskFailed ? (
                                      <span className="text-rose-400 font-bold shrink-0">✕</span>
                                    ) : (
                                      <span className="text-slate-500 shrink-0">○</span>
                                    )}
                                    <span className={`truncate ${isTaskRunning || isOperationRunning ? 'text-indigo-200 font-semibold' : isTaskFailed ? 'text-rose-200 font-semibold' : 'opacity-90'}`}>
                                      {task.title}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[9px] font-semibold ${isTaskRunning || isOperationRunning ? 'text-amber-400 animate-pulse' : isTaskDone ? 'text-emerald-400' : isTaskFailed ? 'text-rose-400' : ''}`}>
                                      {isOperationRunning ? 'APPLYING...' : isTaskRunning ? 'IN PROGRESS' : isTaskDone ? 'DONE' : isTaskFailed ? 'FAILED' : ''}
                                    </span>
                                  </div>
                                </div>

                                {/* Tombol Try Again di level Task jika Task FAILED */}
                                {isTaskFailed && (
                                  <div className="pt-1 mt-1 border-t border-rose-500/20 flex items-center justify-between">
                                    <span className="text-[8px] text-rose-400 font-mono italic">
                                      Task mengalami kegagalan.
                                    </span>
                                    <button
                                      onClick={() => handleRetryTask(plan.id, step.id, task.id)}
                                      className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[8px] transition-all shadow-sm cursor-pointer flex items-center gap-1"
                                    >
                                      <span>🔄</span>
                                      <span>Try Again</span>
                                    </button>
                                  </div>
                                )}

                                {/* Operations List (Tampil satu per satu secara berurutan / progresif) */}
                                {operations.length > 0 && (
                                  <div className="space-y-1.5 pt-1">
                                    {operations
                                      .filter((op, idx) => {
                                        // Tampilkan jika statusnya DONE, IN_PROGRESS, atau FAILED
                                        if (op.status === 'DONE' || op.status === 'IN_PROGRESS' || op.status === 'FAILED') return true;

                                        // Cek apakah semua operasi sebelum index ini sudah DONE
                                        const prevOpsAreDone = operations.slice(0, idx).every(prev => prev.status === 'DONE');
                                        return prevOpsAreDone;
                                      })
                                      .map((op, idx) => {
                                        const isOpRunning = op.status === 'IN_PROGRESS';
                                        const isOpDone = op.status === 'DONE';
                                        const isOpFailed = op.status === 'FAILED';
                                        const targetText = 'path' in op ? op.path : op.command;
                                        const canApply = op.status === "TODO";

                                        // Mengambil pesan error dari op (mendukung properti operation_error, error, atau message)
                                        // const operationError = (op as any)?.operation_error || (op as any)?.error || (op as any)?.message || "";

                                        return (
                                          <div
                                            key={idx}
                                            className={`flex flex-col gap-1 p-1.5 rounded bg-[var(--vscode-input-background)] border ${isOpFailed
                                              ? 'border-rose-500/60 bg-rose-950/10'
                                              : 'border-[var(--vscode-input-border)]'
                                              } space-y-1`}
                                          >
                                            {/* Header baris operation */}
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-1.5 min-w-0 font-mono text-[9px]">
                                                {renderOpBadge(op.type)}
                                                <code className="truncate px-1 py-0.5 rounded bg-[var(--vscode-editor-background)] text-[9px] text-amber-200/90 border border-[var(--vscode-widget-border,rgba(255,255,255,0.04))]">
                                                  {targetText}
                                                </code>
                                              </div>

                                              {/* Status Icon & Tombol Apply per Operation */}
                                              <div className="shrink-0 flex items-center gap-1.5">
                                                {isOpRunning && (
                                                  <span className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                                )}

                                                {isOpDone && (
                                                  <span className="text-[10px] text-emerald-400 font-bold">✓</span>
                                                )}

                                                {isOpFailed && (
                                                  <span className="text-[10px] text-rose-400 font-bold">✕</span>
                                                )}

                                                {canApply && (
                                                  <button
                                                    onClick={() => handleApplyOperation(step.id, task.id, op)}
                                                    className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[8px] transition-all shadow-sm cursor-pointer flex items-center gap-1"
                                                  >
                                                    <span>Apply</span>
                                                  </button>
                                                )}
                                              </div>
                                            </div>

                                            {/* Detail operasi perubahan (changes) */}
                                            {'changes' in op && op.changes && op.changes.length > 0 && (
                                              <div className="pl-1 border-l-2 border-amber-500/40 text-[8.5px] font-mono text-amber-200/70 space-y-0.5">
                                                {op.changes.map((change, cIdx) => (
                                                  <div key={cIdx} className="truncate">
                                                    - <span className="text-rose-400">{change.search}</span>
                                                    <br />
                                                    + <span className="text-emerald-400">{change.replace}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}

                                            {'cwd' in op && op.cwd && (
                                              <div className="text-[8.5px] font-mono opacity-50 pl-1">
                                                📁 cwd: {op.cwd}
                                              </div>
                                            )}

                                            {'content' in op && op.content && (
                                              <pre className="text-[8px] font-mono p-1 rounded bg-[var(--vscode-editor-background)] opacity-70 max-h-16 overflow-hidden truncate">
                                                {op.content.trim().slice(0, 100)}...
                                              </pre>
                                            )}

                                            {/* Tampilan Pesan Operation Error jika ada */}
                                            {/* {isOpFailed && operationError && (
                                              <div className="p-1 rounded bg-rose-950/30 border border-rose-500/30 text-[8px] font-mono text-rose-300 break-words">
                                                <span className="font-bold">Error:</span> {operationError}
                                              </div>
                                            )} */}

                                            {/* Bagian Bawah jika FAILED: Tombol Resolve & Try Again */}
                                            {isOpFailed && (
                                              <div className="pt-1 mt-1 border-t border-rose-500/20 flex items-center justify-between gap-1">
                                                <span className="text-[8px] text-rose-400 font-mono italic truncate">
                                                  Gagal dieksekusi.
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                  {/* Tombol Resolve */}
                                                  <button
                                                    onClick={() => handleRefreshTask()}
                                                    className="px-2 py-0.5 rounded bg-green-600 hover:bg-green-500 text-white font-semibold text-[8px] transition-all shadow-sm cursor-pointer flex items-center gap-1"
                                                    title="Tandai atau selesaikan error ini"
                                                  >
                                                    <span>Refresh</span>
                                                  </button>
                                                  <button
                                                    onClick={() => handleResolveOperation(step.id, task.id, op)}
                                                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[8px] transition-all shadow-sm cursor-pointer flex items-center gap-1"
                                                    title="Tandai atau selesaikan error ini"
                                                  >
                                                    <span>✓</span>
                                                    <span>Resolve</span>
                                                  </button>

                                                  {/* Tombol Try Again */}
                                                  <button
                                                    onClick={() => handleApplyOperation(step.id, task.id, op)}
                                                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-[8px] transition-all shadow-sm cursor-pointer flex items-center gap-1"
                                                  >
                                                    <span>🔄</span>
                                                    <span>Try Again</span>
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          // --- STANDARD CHAT BUBBLE ---
          return (
            <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[92%] p-2.5 rounded-lg ${msg.sender === 'user' ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]' : 'bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border,rgba(255,255,255,0.08))]'}`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>
            </div>
          );
        })}

        {isLoading && (
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