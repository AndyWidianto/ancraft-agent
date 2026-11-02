import {
  DocumentationRequest,
  DocumentationResult,
  DocumentationSource,
} from "../types/documentation";

interface Context7Library {
  id: string;
  title: string;
  description?: string;
  trustScore?: number;
  benchmarkScore?: number;
  versions?: string[];
}

interface Context7SearchResponse {
  results: Context7Library[];
}

export class DocumentationService {
  private readonly baseUrl = "https://context7.com/api/v2";

  private readonly cache = new Map<
    string,
    {
      result: DocumentationResult;
      expiresAt: number;
    }
  >();

  private readonly cacheTTL = 1000 * 60 * 60;

  constructor(private readonly apiKey?: string) {
    this.apiKey = "";
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string>,
    responseType: "json" | "text" = "json"
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      Accept:
        responseType === "json"
          ? "application/json"
          : "text/plain",
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(
        `Context7 request failed: ${response.status}`
      );
    }

    if (responseType === "text") {
      return (await response.text()) as T;
    }

    return (await response.json()) as T;
  }

  private async searchLibrary(
    library: string,
    query: string
  ): Promise<DocumentationSource | null> {
    const data = await this.request<Context7SearchResponse>(
      "/libs/search",
      {
        libraryName: library,
        query,
      }
    );

    if (!data.results?.length) {
      return null;
    }

    // Context7 biasanya mengurutkan hasil berdasarkan relevansi.
    // Untuk versi awal, gunakan kandidat pertama.
    const selected = data.results[0];

    return {
      id: selected.id,
      title: selected.title,
      description: selected.description ?? "",
      trustScore: selected.trustScore ?? 0,
      benchmarkScore: selected.benchmarkScore ?? 0,
      versions: selected.versions ?? [],
    };
  }

  private async getDocumentation(
    libraryId: string,
    query: string
  ): Promise<string> {
    return this.request<string>(
      "/context",
      {
        libraryId,
        query,
        type: "txt",
      },
      "text"
    );
  }

  async search(
    request: DocumentationRequest
  ): Promise<DocumentationResult> {
    const { library, version, query } = request;

    const cacheKey = JSON.stringify({
      library: library.toLowerCase().trim(),
      version: version ?? "",
      query: query.trim(),
    });

    const cached = this.cache.get(cacheKey);

    if (cached) {
      if (Date.now() < cached.expiresAt) {
        return {
          ...cached.result,
          cached: true,
        };
      }

      this.cache.delete(cacheKey);
    }

    try {
      const searchQuery = [
        library,
        version,
        query,
      ]
        .filter(Boolean)
        .join(" ");

      const source = await this.searchLibrary(
        library,
        searchQuery
      );

      if (!source) {
        return {
          status: "NOT_FOUND",
          library,
          version,
          query,
          content: "",
          cached: false,
        };
      }

      const content = await this.getDocumentation(
        source.id,
        searchQuery
      );

      if (!content.trim()) {
        return {
          status: "NOT_FOUND",
          library,
          version,
          query,
          source,
          content: "",
          cached: false,
        };
      }

      const result: DocumentationResult = {
        status: "FOUND",
        library,
        version,
        query,
        source,
        content,
        cached: false,
      };

      this.cache.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.cacheTTL,
      });

      return result;
    } catch (error) {
      return {
        status: "ERROR",
        library,
        version,
        query,
        content: "",
        cached: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }
}