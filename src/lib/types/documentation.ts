export interface DocumentationRequest {
  type: "DOCUMENTATION";
  library: string;
  version?: string;
  query: string;
}

export interface DocumentationSource {
  id: string;
  title: string;
  description: string;
  trustScore: number;
  benchmarkScore: number;
  versions: string[];
}

export interface DocumentationResult {
  status: "FOUND" | "NOT_FOUND" | "ERROR";
  library: string;
  version?: string;
  query: string;
  source?: DocumentationSource;
  content: string;
  cached: boolean;
  error?: string;
}