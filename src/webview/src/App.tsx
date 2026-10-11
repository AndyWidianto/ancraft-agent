import { useState, useEffect, useRef } from 'react';
import type { ActionType, Agent, BackgroundMessage, ChatMessage, ExecuteStepData, OperationResult, PlanningMessageData, QuestionnaireData, StatusTask, TechStackData, TypeProvider } from './types';
//import { mockMessages } from './data/mockup';
import AgentInput from './components/AgentInput';

export interface RefreshActionItem {
  action: string;
  data: any;
  refreshAt: Date;
  planningId: string;
  operationId: number;
}

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

export default function App() {

  const [model, setModel] = useState({
    planning: "",
    executor: "",
    indexing: ""
  })
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isRefresh, setIsRefresh] = useState(false);
  const [newUpdateAt, setNewUpdateAt] = useState<null | Date>(null);
  const [autoApply, setAutoApply] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [questionnaireSelections, setQuestionnaireSelections] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<OperationResult[]>([]);

  const [cacheValue, setCacheValue] = useState("");

  const [loadingGetModels, setLoadingGetModels] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const executingTaskIdRef = useRef<number | string | null>(null);

  const getModels = ({ provider, apikey }: { provider: TypeProvider, apikey: string }) => {
    setLoadingGetModels(true);
    vscode?.postMessage({
      command: "SEND_MESSAGE",
      action: "GET_MODELS",
      data: { provider, apikey }
    })
  }

  const handleStop = () => {
    // Kirim sinyal pembatalan ke extension host / background
    if (typeof vscode !== 'undefined') {
      vscode?.postMessage({
        command: 'ABORT_REQUEST',
      });
    }
  };

  const getModelConfig = (modelCodeName: string) => {
    const matchedAgent = agents.find((agent) =>
      agent.models.some((m) => m.code_name === modelCodeName)
    );

    return {
      provider: matchedAgent?.provider || '',
      apikey: matchedAgent?.apikey || '',
      model: modelCodeName,
    };
  };

  const changeModel = (type: "plan" | "executor" | "indexing", value: string) => {
    setModel(prev => ({
      ...prev,
      ...(type === "plan" ? { planning: value } : type === "executor" ? { executor: value } : { indexing: value })
    }))
  }

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const getPlanning = (data: any) => {
    setIsLoading(false);
    setMessages((prev) => [
      ...prev,
      {
        id: data.id || Date.now().toString(),
        sender: 'agent',
        type: 'PLANNING',
        timestamp: new Date().toISOString(),
        planning: data
      }
    ]);
  }

  const getTasks = (data: any) => {
    const { planningId, stepId, tasks } = data;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type === 'PLANNING' && msg.planning && msg.planning.id === planningId) {
          const updatedSteps = msg.planning.steps.map((step) => {
            if (step.id === stepId) {
              return { ...step, tasks: tasks };
            }
            return step;
          });
          return { ...msg, planning: { ...msg.planning, steps: updatedSteps } };
        }
        return msg;
      })
    );
  }

  const getOperations = (data: any) => {
    const { planningId, stepId, taskId, operations } = data;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type === 'PLANNING' && msg.planning && msg.planning.id === planningId) {
          const updatedSteps = msg.planning.steps.map((step) => {
            if (step.id === stepId) {
              const updatedTasks = step.tasks.map((task) => {
                if (task.id === taskId) {
                  return { ...task, operations: operations };
                }
                return task;
              });
              return { ...step, tasks: updatedTasks };
            }
            return step;
          });
          return { ...msg, planning: { ...msg.planning, steps: updatedSteps } };
        }
        return msg;
      })
    );
  }

  const updateStatusOperation = (data: any) => {
    const { planningId, stepId, taskId, operationId, status } = data;

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type === 'PLANNING' && msg.planning && msg.planning.id === planningId) {
          const updatedSteps = msg.planning.steps.map((step) => {
            if (step.id === stepId) {
              const updatedTasks = step.tasks.map((task) => {
                if (task.id === taskId && task.operations) {
                  const updatedOps = task.operations.map((op, idx) =>
                    op.id === operationId || idx === operationId ? { ...op, status } : op
                  );

                  const totalDone = updatedOps.filter((o) => o.status === 'DONE').length;
                  const taskStatus = updatedOps.length === totalDone ? 'DONE' as StatusTask : 'IN_PROGRESS' as StatusTask;

                  return { ...task, status: taskStatus, operations: updatedOps };
                }
                return task;
              });
              return { ...step, tasks: updatedTasks };
            }
            return step;
          });
          return { ...msg, planning: { ...msg.planning, steps: updatedSteps } };
        }
        return msg;
      })
    );
  }

  const updateStatusStep = (data: any) => {
    const { planningId, stepId, status } = data;

    // Jika step selesai, lepaskan lock agar useEffect bebas memproses step selanjutnya
    if (status === 'DONE') {
      executingTaskIdRef.current = null;
    }

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type === 'PLANNING' && msg.planning && msg.planning.id === planningId) {
          const updatedSteps = msg.planning.steps.map((step) => {
            if (step.id === stepId) {
              return { ...step, status: status };
            }
            return step;
          });
          return { ...msg, planning: { ...msg.planning, steps: updatedSteps } };
        }
        return msg;
      })
    );
  }

  const updateStatusTask = (data: any) => {
    const { planningId, stepId, taskId, status } = data;
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type === 'PLANNING' && msg.planning && msg.planning.id === planningId) {
          const updatedSteps = msg.planning.steps.map((step) => {
            if (step.id === stepId) {
              const updatedTasks = step.tasks.map((task) => {
                if (task.id === taskId) {
                  return { ...task, status: status };
                }
                return task;
              });
              return { ...step, tasks: updatedTasks };
            }
            return step;
          });
          return { ...msg, planning: { ...msg.planning, steps: updatedSteps } };
        }
        return msg;
      })
    );
  }

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
        setAgents(prev => [
          ...prev.filter(p => p.provider !== data.provider),
          data
        ]);
      }

      else if (action === "ERROR") {
        setLoadingGetModels(false);
        setIsLoading(false);

        const data = message.data;

        console.log("Data error: ", data);

        const dataItem: BackgroundMessage = data;
        switch (dataItem.action) {
          case "EXECUTE_OPERATION": {
            updateStatusOperation(dataItem.data);
            break;
          }
          case "EXECUTE_TASK": {
            updateStatusTask(dataItem.data)
          }
        }
        setIsRefresh(true);
      }

      setNewUpdateAt(new Date());
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);


  const executingOperationIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    const lastPlanningMsg = [...messages].reverse().find((m) => m.type === 'PLANNING' && m.planning);
    if (!lastPlanningMsg || !lastPlanningMsg.planning) return;

    const planning = lastPlanningMsg.planning;
    const goal = formatPlanning(planning);

    for (const step of planning.steps) {
      if (step.status === "IN_PROGRESS") break;

      const metaPlanning = getModelConfig(model.planning)
      if (step.tasks.length === 0) {
        vscode?.postMessage({
          command: "SEND_MESSAGE",
          action: "EXECUTE_STEP",
          data: { goal, step: step.description, stepId: step.id, planningId: planning.id, type: step.type } as ExecuteStepData,
          history,
          meta: metaPlanning
        });
        break;
      }

      let isStepCompleted = true;

      for (const task of step.tasks) {
        if (task.status === "IN_PROGRESS") {
          isStepCompleted = false;
          break;
        }

        if (task.status === "TODO") {
          isStepCompleted = false;

          if (executingTaskIdRef.current !== task.id) {
            executingTaskIdRef.current = task.id; // Kunci eksekusi task

            const metaExecutor = getModelConfig(model.executor);
            vscode?.postMessage({
              command: "SEND_MESSAGE",
              action: "EXECUTE_TASK",
              data: {
                goal,
                task: task.description || step.description,
                stepId: step.id,
                taskId: task.id,
                planningId: planning.id,
                type: step.type
              },
              history,
              meta: metaExecutor
            });
          }
          break;
        }

        if (task.status === "DONE" && task.operations && task.operations.length > 0) {
          const totalOperationDone = task.operations.reduce(
            (acc, val) => (val.status === "DONE" ? acc + 1 : acc),
            0
          );

          if (totalOperationDone < task.operations.length) {
            if (autoApply) {
              for (const operation of task.operations) {
                let isTaskCompleted = true;
                if (operation.status === "IN_PROGRESS") {
                  isTaskCompleted = false;
                  break;
                }

                if (operation.status === "TODO") {
                  // 2. KUNCI OPERASI: Cek apakah operation ini sudah pernah dipemicu
                  if (executingOperationIdRef.current !== operation.id) {
                    executingOperationIdRef.current = operation.id; // Set pengunci

                    const dataExecute = {
                      planningId: planning.id,
                      stepId: step.id,
                      taskId: task.id,
                      operationId: operation.id,
                      operation: operation
                    };

                    const metaExecutor = getModelConfig(model.executor);
                    vscode?.postMessage({
                      command: 'SEND_MESSAGE',
                      action: "EXECUTE_OPERATION",
                      data: dataExecute,
                      history,
                      meta: metaExecutor
                    });
                  }

                  isTaskCompleted = false;
                  break; // Keluar dari loop operation
                }
                if (!isTaskCompleted) break;
              }
            }
            isStepCompleted = false;
            break;
          }
        }
      }

      if (!isStepCompleted) {
        break;
      }
    }
  }, [messages, autoApply]);

  const checkTask = (messages: ChatMessage[]) => {
    const lastPlanningMsg = [...messages].reverse().find((m) => m.type === 'PLANNING' && m.planning);
    if (!lastPlanningMsg || !lastPlanningMsg.planning) return;

    const planning = lastPlanningMsg.planning;
    const goal = formatPlanning(planning);

    for (const step of planning.steps) {
      if (step.status === "IN_PROGRESS") break;

      if (step.tasks.length === 0) {
        const metaPlanning = getModelConfig(model.planning)
        vscode?.postMessage({
          command: "SEND_MESSAGE",
          action: "EXECUTE_STEP",
          data: { goal, step: step.description, stepId: step.id, planningId: planning.id, type: step.type } as ExecuteStepData,
          history,
          meta: metaPlanning
        });
        break;
      }

      let isStepCompleted = true; // Flag untuk mengecek apakah seluruh task di step ini benar-benar selesai

      for (const task of step.tasks) {
        if (task.status === "IN_PROGRESS") {
          isStepCompleted = false;
          break; // Keluar dari loop task
        }

        if (task.status === "TODO") {
          isStepCompleted = false; // Step belum selesai karena ada yang TODO

          if (executingTaskIdRef.current !== task.id) {
            executingTaskIdRef.current = task.id; // Kunci eksekusi

            const metaExecutor = getModelConfig(model.executor);
            vscode?.postMessage({
              command: "SEND_MESSAGE",
              action: "EXECUTE_TASK",
              data: {
                goal,
                task: task.description || step.description,
                stepId: step.id,
                taskId: task.id,
                planningId: planning.id,
              },
              history,
              meta: metaExecutor
            });
          }
          break; // Keluar dari loop task
        }

        if (task.status === "DONE" && task.operations && task.operations.length > 0) {
          const totalOperationDone = task.operations.reduce(
            (acc, val) => (val.status === "DONE" ? acc + 1 : acc),
            0
          );

          if (totalOperationDone < task.operations.length) {
            if (autoApply) {
              for (const operation of task.operations) {
                let isTaskCompleted = true;
                if (operation.status === "IN_PROGRESS") {
                  isTaskCompleted = false;
                  break;
                };
                if (operation.status === "TODO") {
                  const dataExecute = {
                    planningId: planning.id,
                    stepId: step.id,
                    taskId: task.id,
                    operationId: operation.id,
                    operation: operation
                  }
                  const metaExecutor = getModelConfig(model.executor);
                  vscode?.postMessage({
                    command: 'SEND_MESSAGE',
                    action: "EXECUTE_OPERATION",
                    data: dataExecute,
                    history,
                    meta: metaExecutor
                  });

                  isTaskCompleted = false;
                  break;
                }
                if (!isTaskCompleted) break;
              }
            }
            isStepCompleted = false;
            break; // Keluar dari loop task
          }
        }
      }

      if (!isStepCompleted) {
        break;
      }
    }
  }

  useEffect(() => {
    checkTask(messages);
  }, [messages]);

  useEffect(() => {
    if (!newUpdateAt) return;

    const fiveMinutesInMs = 5 * 60 * 1000;

    const checkTime = () => {
      const lastUpdate = new Date(newUpdateAt).getTime();
      const now = Date.now();

      if (now - lastUpdate > fiveMinutesInMs) {
        setIsRefresh(true);
      }
    };

    checkTime();

    const intervalId = setInterval(checkTime, 10000);

    return () => clearInterval(intervalId);
  }, [newUpdateAt]);

  const handleSend = async (value: string, planning: string, indexing: string, executor: string) => {
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

    setModel({
      planning,
      indexing,
      executor
    })

    const meta = getModelConfig(planning);
    vscode?.postMessage({
      command: 'SEND_MESSAGE',
      action: "TEXT",
      data: {
        text: userText,
      },
      history,
      meta: meta
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

  // Badge Warna untuk aksi CUD
  const getActionBadge = (type: ActionType) => {
    switch (type) {
      case 'NEED_INFORMATION':
        return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">INFO NEEDED</span>;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen text-xs select-none bg-[var(--vscode-sideBar-background)] text-[var(--vscode-sideBar-foreground)] font-sans">
      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
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
            const handleApplyOperation = (stepId: number, taskId: number, op: any, idx: number) => {
              const dataExecute = {
                planningId: plan.id,
                stepId,
                taskId,
                operationId: op.id ?? idx,
                operation: op
              }
              vscode?.postMessage({
                command: 'SEND_MESSAGE',
                action: "EXECUTE_OPERATION",
                data: dataExecute,
                history,
                meta: getModelConfig(model.executor)
              });
            };

            return (
              <div key={msg.id} className="w-full space-y-2.5 py-1 text-[11px] bg-transparent">

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

                {/* Steps Container */}
                <div className="space-y-2">
                  {plan.steps.map((step) => {
                    // Hanya tampilkan task yang aktif atau sudah jalan/selesai
                    const activeTasks = step.tasks.filter((task) => task.status !== 'TODO');

                    // Jika tidak ada task aktif di step ini, jangan tampilkan Step sama sekali
                    if (step.status === "TODO") return null;

                    return (
                      <div key={step.id} className="space-y-1.5 pl-1">
                        {/* Title Step */}
                        <div className="font-semibold text-[10px] text-sky-400/90 flex items-center gap-1">
                          <span>Step {step.id}:</span>
                          <span className="opacity-90">{step.title}</span>
                        </div>

                        {/* Tasks List */}
                        <div className="space-y-1.5 pl-2 border-l border-[var(--vscode-widget-border,rgba(255,255,255,0.1))]">
                          {activeTasks.map((task) => {
                            const isTaskRunning = task.status === 'IN_PROGRESS';
                            const isTaskDone = task.status === 'DONE';
                            const operations = task.operations || [];

                            // Cari index dari operation pertama yang belum dieksekusi (TODO/tanpa status)
                            const nextPendingOpIndex = operations.findIndex(
                              (op) => !op.status || op.status === 'TODO'
                            );

                            // Cek apakah ada operation yang sedang berjalan
                            const hasOpRunning = operations.some((op) => op.status === 'IN_PROGRESS');

                            return (
                              <div
                                key={task.id}
                                className={`p-2 rounded transition-all space-y-2 ${isTaskRunning
                                  ? 'bg-indigo-950/20 border border-indigo-500/40'
                                  : 'bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border,rgba(255,255,255,0.06))]'
                                  }`}
                              >
                                {/* Task Header */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 font-medium min-w-0">
                                    {isTaskRunning ? (
                                      <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                    ) : isTaskDone ? (
                                      <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                    ) : (
                                      <span className="text-slate-500 shrink-0">○</span>
                                    )}
                                    <span className={`truncate ${isTaskRunning ? 'text-indigo-200 font-semibold' : 'opacity-90'}`}>
                                      {task.title}
                                    </span>
                                  </div>

                                  <span className={`text-[9px] font-semibold shrink-0 ${isTaskRunning ? 'text-amber-400 animate-pulse' : isTaskDone ? 'text-emerald-400' : ''}`}>
                                    {isTaskRunning ? 'IN PROGRESS' : isTaskDone ? 'DONE' : ''}
                                  </span>
                                </div>

                                {/* Operations List (Hanya tampil jika Task bernilai DONE) */}
                                {isTaskDone && operations.length > 0 && (
                                  <div className="space-y-1.5 pt-1">
                                    {operations.map((op, idx) => {
                                      const isOpRunning = op.status === 'IN_PROGRESS';
                                      const isOpDone = op.status === 'DONE';
                                      const isOpPending = !op.status || op.status === 'TODO';
                                      const targetText = 'path' in op ? op.path : op.command;

                                      // Tombol Apply manual HANYA aktif untuk operasi TODO urutan pertama dan jika tidak ada yang sedang berjalan
                                      const canApply = isOpPending && idx === nextPendingOpIndex && !hasOpRunning;

                                      return (
                                        <div
                                          key={idx}
                                          className="flex flex-col gap-1 p-1.5 rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] space-y-1"
                                        >
                                          {/* Header baris operation */}
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0 font-mono text-[9px]">
                                              {renderOpBadge(op.type)}
                                              <code className="truncate px-1 py-0.5 rounded bg-[var(--vscode-editor-background)] text-[9px] text-amber-200/90 border border-[var(--vscode-widget-border,rgba(255,255,255,0.04))]">
                                                {targetText}
                                              </code>
                                            </div>

                                            {/* Status Icon & Tombol Apply */}
                                            <div className="shrink-0 flex items-center gap-1.5">
                                              {isOpRunning && (
                                                <span className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                              )}

                                              {isOpDone && (
                                                <span className="text-[10px] text-emerald-400 font-bold">✓</span>
                                              )}

                                              {/* Tombol Apply untuk eksekusi manual satu per satu */}
                                              {canApply && (
                                                <button
                                                  onClick={() => handleApplyOperation(step.id, task.id, op, idx)}
                                                  className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[8px] transition-all shadow-sm cursor-pointer"
                                                >
                                                  Apply
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          {/* Detail operasi */}
                                          {'changes' in op && op.changes && op.changes.length > 0 && (
                                            <div className="pl-1 border-l-2 border-amber-500/40 text-[8.5px] font-mono text-amber-200/70 space-y-0.5">
                                              {op.changes.map((change, cIdx) => (
                                                <div key={cIdx} className="truncate">
                                                  <span className="text-rose-400">- {change.search}</span>
                                                  <br />
                                                  <span className="text-emerald-400">+ {change.replace}</span>
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
        {isRefresh && <button
          onClick={() => {
            checkTask(messages);
            setIsRefresh(false);
            setNewUpdateAt(new Date());
          }}
          className="w-full py-1.5 px-2 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded font-semibold hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-30 disabled:cursor-not-allowed transition-all text-center"
        >
          Lanjutkan
        </button>}
        <div ref={chatEndRef} />
      </div>

      {/* Input Field */}
      <AgentInput
        model={model}
        onChangeModel={changeModel}
        agents={agents}
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