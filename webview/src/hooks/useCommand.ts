import type { ChatMessage, TypeProvider } from "../types";

interface CommandProps {
    setLoadingGetModels: (state: boolean) => void;
    cacheValue: string;
    setInputValue: (state: string) => void;
    setIsLoading: (state: boolean) => void;
    setAutoApply: (state: boolean) => void;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
    executingTaskIdRef: React.RefObject<string | number | null>
}
export default function useCommands(vscode: any, {
    setLoadingGetModels, setInputValue, setIsLoading, cacheValue
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


    return {
        getModels,
        handleStop,
    }
}