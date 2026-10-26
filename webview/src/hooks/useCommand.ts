import type { BackgroundMessage, ChatMessage, TypeProvider } from "../types";

interface CommandProps {
    setLoadingGetModels: (state: boolean) => void;
    cacheValue: string;
    setInputValue: (state: string) => void;
    setIsLoading: (state: boolean) => void;
    setAutoApply: (state: boolean) => void;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
    setLoadingOperation: (state: boolean) => void;
    executingTaskIdRef: React.RefObject<string | number | null>
}
export default function useCommands(vscode: any, {
    setLoadingGetModels, setInputValue, setIsLoading, cacheValue, setMessages, setLoadingOperation, executingTaskIdRef, setAutoApply
}: CommandProps) {
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

    const getPlanning = (data: any) => {
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
        const { planningId, stepId, taskId, status, operationId, error } = data;

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
                                            return { ...op, status, apply: !op?.apply ? status === "DONE" ? true : false : op?.apply, error }
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
        const { planningId, stepId, taskId, status, result_search } = data;
        setMessages((prev) =>
            prev.map((msg) => {
                if (msg.type === 'PLANNING' && msg.planning && msg.planning.id === planningId) {
                    const updatedSteps = msg.planning.steps.map((step) => {
                        if (step.id === stepId) {
                            const updatedTasks = step.tasks.map((task) => {
                                if (task.id === taskId) {
                                    return { ...task, status: status, result_search };
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

    const handleError = (data: any) => {
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

    return {
        getModels,
        handleStop,
        updateStatusOperation,
        getPlanning,
        getTasks,
        getOperations,
        updateStatusStep,
        updateStatusTask,
        handleError
    }
}