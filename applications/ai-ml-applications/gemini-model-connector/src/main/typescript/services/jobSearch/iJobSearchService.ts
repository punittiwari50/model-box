import type {
  JobSearchRequest,
  JobSearchArtifactResponse,
} from "@/domain/index.js";

/**
 * Port contract for Job Search Application Service.
 */
export interface IJobSearchService {
  analyzeAndGenerateMarkdown(
    request: JobSearchRequest,
    clientIp?: string,
  ): Promise<JobSearchArtifactResponse>;
}
