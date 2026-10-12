import { useState, useEffect, useRef } from 'react';
import type {
  ActionType,
  Agent,
  BackgroundMessage,
  ChatMessage,
  ExecuteStepData,
  Operation,
  OperationResult,
  PlanningMessageData,
  QuestionnaireData,
  TechStackData,
  TypeProvider
} from './types';
//import { mockMessages } from './data/mockup';
import AgentInput from './components/AgentInput';
import { Loader2 } from 'lucide-react';

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
  });
  const [taskId, setTaskId] = useState<string | null>(null);
  const [loadingOperation, setLoadingOperation] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
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
    setInputValue(cacheValue);
    setIsLoading(false);
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


  const getModelsConfig = (modelCodeName: string) => {
    const matchedAgent = agents.find((agent) =>
      agent.models.some((m) => m.code_name === modelCodeName)
    );

    return matchedAgent;
  };

  const changeModel = (type: "plan" | "executor" | "indexing", value: string) => {
    setModel(prev => ({
      ...prev,
      ...(type === "plan" ? { planning: value } : type === "executor" ? { executor: value } : { indexing: value })
    }));

    const models = getModelsConfig(value);
    if (models) {
      vscode?.postMessage({
        command: "SELECTED_MODEL",
        models: {
          ...models,
          models: models.models.map(model => {
            // Jika code_name tidak cocok, kembalikan model apa adanya
            if (model.code_name !== value) return model;

            // Jika cocok, ubah status sesuai dengan tipenya
            return {
              ...model,
              selectedPlanning: type === "plan" ? true : model.selectedPlanning,
              selectedIndexing: type === "indexing" ? true : model.selectedIndexing,
              selectedExecutor: type === "executor" ? true : model.selectedExecutor,
            };
          }),
        }
      })
    }
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
    const { planningId, stepId, taskId, status, operationId } = data;

    console.log("Operation status update: ", data);

    if (status === "DONE") {
      setLoadingOperation(false);
    }

    // Update state `setMessages` untuk planning terkait
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.type === 'PLANNING' && msg.planning && msg.planning.id === planningId) {
          const updatedSteps = msg.planning.steps.map((step) => {
            if (step.id === stepId) {
              const updatedTasks = step.tasks.map((task) => {
                if (task.id === taskId && task.operations) {
                  const updateOperations = task.operations.map(op => {
                    if (op.id === operationId) {
                      return {...op, status, apply: !op?.apply ? status === "DONE" ? true : false : op?.apply }
                    }
                    return op
                  });
                  return { ...task, operations: updateOperations };
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

    console.log("Step: ", data);

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

        const dataItem: Agent = data;
        setAgents(prev => [
          ...prev.filter(p => p?.provider !== data?.provider),
          dataItem
        ]);

        if (message.type === "READ") {
          const selectedIndexing = dataItem.models.find(m => m?.selectedIndexing)?.name ?? dataItem.models.filter(m => m.isEmbedding)[0]?.name;

          const selectedPlanning = dataItem.models.find(m => m?.selectedPlanning)?.name ?? dataItem.models.filter(m => m.isChat)[0]?.name;

          const selectedExecutor = dataItem.models.find(m => m?.selectedExecutor)?.name ?? dataItem.models.filter(m => m.isChat)[0]?.name;

          setModel({
            executor: selectedExecutor,
            indexing: selectedIndexing,
            planning: selectedPlanning
          })
        }
      }

      else if (action === "ERROR") {
        setLoadingGetModels(false);
        setIsLoading(false);

        console.log("Data error: ", data);

        const dataItem: BackgroundMessage = data.data;

        setAutoApply(false);
        setMessages(prev => prev.map(m => m?.planning ? ({
          ...m,
          planning: (m.planning.id === (dataItem.data as any)?.planningId ? {
            ...m?.planning,
            status: "FAILED",
          } : m?.planning),
        }) : m));
        switch (dataItem.action) {
          case "EXECUTE_OPERATION": {
            updateStatusOperation(dataItem.data);
            break;
          }
          case "EXECUTE_TASK": {
            updateStatusTask(dataItem.data)
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);


  const executingOperationIdRef = useRef<string | number | null>(null);

  // useEffect(() => {
  //   if (!loadingOperation || !processTask || !processTask.operations) return;

  //   let isCompleted = true;
  //   let hasSentMessage = false;

  //   const updatedOperations = processTask.operations.map((operation) => {
  //     if (operation.status === "DONE") {
  //       return operation;
  //     }

  //     if (operation.status === "IN_PROGRESS" || !autoApply) {
  //       isCompleted = false;
  //       return operation;
  //     }

  //     // Jika operasi masih TODO dan belum ada pesan yang dikirim pada siklus ini:
  //     if (!hasSentMessage && (!operation.status || operation.status === "TODO")) {
  //       hasSentMessage = true;
  //       isCompleted = false;

  //       const dataExecute = {
  //         planningId: processTask?.planningId,
  //         stepId: processTask?.stepId,
  //         taskId: processTask.id,
  //         operationId: operation.id,
  //         operation: operation
  //       };

  //       const metaExecutor = getModelConfig(model.executor);
  //       vscode?.postMessage({
  //         command: 'SEND_MESSAGE',
  //         action: "EXECUTE_OPERATION",
  //         data: dataExecute,
  //         history,
  //         meta: metaExecutor
  //       });

  //       return { ...operation, status: "IN_PROGRESS" as StatusTask };
  //     }

  //     isCompleted = false;
  //     return operation;
  //   });

  //   if (hasSentMessage) {
  //     setTask({ ...processTask, operations: updatedOperations ?? [] });
  //   }

  //   if (isCompleted) {
  //     setTask(null);
  //     setLoadingOperation(false);
  //   }
  // }, [loadingOperation, processTask, autoApply, history, model]);

  useEffect(() => {
    console.log(messages);

    const lastPlanningMsg = [...messages].reverse().find((m) => m.type === 'PLANNING' && m.planning);
    if (!lastPlanningMsg || !lastPlanningMsg.planning) return;

    const planning = lastPlanningMsg.planning;
    const goal = formatPlanning(planning);

    let finished = true;

    for (const [index, step] of planning.steps.entries()) {
      if (step.status === "IN_PROGRESS") break;

      const provSteps = planning.steps.slice(0, index).map(s => s.description || "").slice(-2);
      const nextSteps = planning.steps.slice(index + 1).map(s => s.description || "").slice(-2);

      const metaPlanning = getModelConfig(model.planning);
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
            meta: metaPlanning
          });
        }
        finished = false;
        console.log("Berhenti di execute step")
        break;
      }

      let isStepCompleted = true;

      for (const [indexTask, task] of step.tasks.entries()) {
        if (task.status === "IN_PROGRESS") {
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

            const metaExecutor = getModelConfig(model.executor);
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
                previousTasks: provTasks
              },
              history,
              meta: metaExecutor
            });
            finished = false;
            break;
          }
        }

        if (task.status === "DONE" && task.operations && task.operations.length > 0) {
          const todoOpIsAvaliable = task.operations.some(op => op.status === "TODO");
          let isTaskCompleted = true;

          if (todoOpIsAvaliable && !loadingOperation) {
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

                const metaExecutor = getModelConfig(model.executor);
                vscode?.postMessage({
                  command: 'SEND_MESSAGE',
                  action: "EXECUTE_OPERATION",
                  data: dataExecute,
                  history,
                  meta: metaExecutor
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
  }, [messages, autoApply, loadingOperation]);

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

  const handleRetryPlan = (id: string) => {
    const message = messages.find(message => message.planning ? message.planning.id === id ? true : false : false);
    const planning = message?.planning;

    if (!planning) return;

    const goal = formatPlanning(planning);

    for (const [index, step] of planning.steps.entries()) {
      if (step.status === "IN_PROGRESS") break;

      const provSteps = planning.steps.slice(0, index).map(s => s.description || "").slice(-2);
      const nextSteps = planning.steps.slice(index + 1).map(s => s.description || "").slice(-2);

      const metaPlanning = getModelConfig(model.planning);
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
        vscode?.postMessage({
          command: "SEND_MESSAGE",
          action: "EXECUTE_STEP",
          data: dataExecute,
          history,
          meta: metaPlanning
        });
        break;
      }

      let isStepCompleted = true;

      for (const [indexTask, task] of step.tasks.entries()) {
        if (task.status === "IN_PROGRESS") {
          isStepCompleted = false;
          break;
        }

        if (task.status === "TODO") {
          isStepCompleted = false;

          if (executingTaskIdRef.current !== task.id) {
            executingTaskIdRef.current = task.id; // Kunci eksekusi task

            const metaExecutor = getModelConfig(model.executor);
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
                previousTasks: provTasks
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
            for (const operation of task.operations) {
              let isTaskCompleted = true;
              if (operation.status === "IN_PROGRESS") {
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
                isTaskCompleted = false;
                break;
              }

              if (operation.status === "TODO") {
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
            isStepCompleted = false;
            break;
          }
        }
      }

      if (!isStepCompleted) {
        break;
      }

      setMessages(prev => prev.map(mes => mes.planning ? mes.planning.id === id ? ({ ...mes, planning: { ...mes.planning, status: "IN_PROGRESS" } }) : mes : mes))
    }
  }

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
                meta: getModelConfig(model.executor)
              });
            };

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

                    return (
                      <div key={step.id} className="space-y-1.5 pl-1">
                        <div className="font-semibold text-[10px] text-sky-400/90 flex items-center justify-between w-full">
                          <div className="flex items-center gap-1">
                            <span>Step {step.id}:</span>
                            <span className="opacity-90">{step.title}</span>
                          </div>

                          {step.status === "IN_PROGRESS" && (
                            <div className="flex items-center gap-1 text-sky-400">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span className="text-[9px] lowercase italic opacity-90">running...</span>
                            </div>
                          )}
                        </div>

                        {/* Tasks List */}
                        <div className="space-y-1.5 pl-2 border-l border-[var(--vscode-widget-border,rgba(255,255,255,0.1))]">
                          {activeTasks.map((task) => {
                            const isTaskRunning = task.status === 'IN_PROGRESS';
                            const isTaskDone = task.status === 'DONE';
                            const operations = task.operations || [];

                            const isOperationRunning = loadingOperation && taskId === `planning:${plan.id}:${step.id}:${task.id}`;

                            return (
                              <div
                                key={task.id}
                                className={`p-2 rounded transition-all space-y-2 ${isTaskRunning || isOperationRunning
                                  ? 'bg-indigo-950/20 border border-indigo-500/40'
                                  : 'bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border,rgba(255,255,255,0.06))]'
                                  }`}
                              >
                                {/* Task Header */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 font-medium min-w-0">
                                    {isTaskRunning || isOperationRunning ? (
                                      <span className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                    ) : isTaskDone ? (
                                      <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                    ) : (
                                      <span className="text-slate-500 shrink-0">○</span>
                                    )}
                                    <span className={`truncate ${isTaskRunning || isOperationRunning ? 'text-indigo-200 font-semibold' : 'opacity-90'}`}>
                                      {task.title}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[9px] font-semibold ${isTaskRunning || isOperationRunning ? 'text-amber-400 animate-pulse' : isTaskDone ? 'text-emerald-400' : ''}`}>
                                      {isOperationRunning ? 'APPLYING...' : isTaskRunning ? 'IN PROGRESS' : isTaskDone ? 'DONE' : ''}
                                    </span>
                                  </div>
                                </div>

                                {/* Operations List (Tampil satu per satu secara berurutan / progresif) */}
                                {operations.length > 0 && (
                                  <div className="space-y-1.5 pt-1">
                                    {operations
                                      .filter((op, idx) => {
                                        if (op.status === 'DONE' || op.status === 'IN_PROGRESS') return true;

                                        // Cek apakah semua operasi sebelum index ini sudah DONE
                                        const prevOpsAreDone = operations.slice(0, idx).every(prev => prev.status === 'DONE');
                                        return prevOpsAreDone;
                                      })
                                      .map((op, idx) => {
                                        const isOpRunning = op.status === 'IN_PROGRESS';
                                        const isOpDone = op.status === 'DONE';;
                                        const targetText = 'path' in op ? op.path : op.command;
                                        const canApply = op.status === "DONE" && op?.apply;

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

                                              {/* Status Icon & Tombol Apply per Operation */}
                                              <div className="shrink-0 flex items-center gap-1.5">
                                                {isOpRunning && (
                                                  <span className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                                )}

                                                {isOpDone && (
                                                  <span className="text-[10px] text-emerald-400 font-bold">✓</span>
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
        <div ref={chatEndRef} />
      </div>

      {/* Input Field */}
      <AgentInput
        inputValue={inputValue}
        setInputValue={setInputValue}
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