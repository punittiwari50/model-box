import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const ENGINE_MCP_TOOLS: Tool[] = [
  {
    name: 'execute_workflow',
    description:
      'Parses and executes a dynamic JSON Playwright workflow with concurrency management, watchdog stuck-process killer, circuit breaker resilience, and network authentication sniffing.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: 'The JSON workflow definition containing steps, dynamic variables, and selectors.',
        },
        variables: {
          type: 'object',
          description: 'Optional runtime variable overrides to inject into the workflow context.',
        },
      },
      required: ['workflow'],
    },
  },
  {
    name: 'catalog_endpoints',
    description:
      'Navigates to a target URL, captures all HTTP requests and responses, and produces an endpoint catalog marking where authentication or authorization is required.',
    inputSchema: {
      type: 'object',
      properties: {
        targetUrl: {
          type: 'string',
          description: 'The target website URL to scan and catalog.',
        },
        actions: {
          type: 'array',
          description: 'Optional interactions to trigger dynamic API endpoints (e.g. click, scroll).',
          items: { type: 'object' },
        },
        timeoutMs: {
          type: 'number',
          description: 'Maximum scan duration in milliseconds (default 30000).',
        },
      },
      required: ['targetUrl'],
    },
  },
  {
    name: 'generate_playwright_code',
    description:
      'Generates generalized Playwright TypeScript automation code adhering strictly to @/... import conventions from a JSON workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'object',
          description: 'The workflow definition to convert into generalized TypeScript code.',
        },
      },
      required: ['workflow'],
    },
  },
  {
    name: 'ollama_assist',
    description:
      'Connects to the Ollama service to analyze screenshots, synthesize resilient element selectors, or generate workflow JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt or instruction for Ollama.' },
        model: { type: 'string', description: 'Ollama model name (default qwen2.5:latest).' },
        screenshotBase64: { type: 'string', description: 'Optional base64 screenshot for multimodal vision models.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'comfyui_generate',
    description:
      'Connects to the ComfyUI service to trigger image/asset generation workflows and retrieve output images.',
    inputSchema: {
      type: 'object',
      properties: {
        positivePrompt: { type: 'string', description: 'The text prompt to generate.' },
        negativePrompt: { type: 'string', description: 'Negative prompt for generation.' },
        seed: { type: 'number', description: 'Optional generation seed.' },
      },
      required: ['positivePrompt'],
    },
  },
  {
    name: 'get_engine_metrics',
    description:
      'Returns real-time engine metrics: active concurrency, peak concurrency, circuit breaker statuses per domain, and stuck process kill stats.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'google_xray_search',
    description:
      'Executes enterprise Google X-Ray search automation to discover talent, profiles, documents, and technical endpoints across LinkedIn, GitHub, StackOverflow, and custom domains with Boolean operator synthesis.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['linkedin', 'github', 'stackoverflow', 'document', 'custom'],
          description: 'The target platform to X-Ray slice (default: linkedin).',
        },
        role: {
          type: 'string',
          description: 'Target job title or role (e.g. "Staff Distributed Systems Engineer").',
        },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required technical skills or technology stack.',
        },
        location: {
          type: 'string',
          description: 'Target geographical region or city.',
        },
        company: {
          type: 'string',
          description: 'Target current or past organization.',
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'Terms to explicitly negate from search results (e.g. ["Recruiter"]).',
        },
        fileType: {
          type: 'string',
          description: 'Filetype extension when searching documents (e.g. "pdf", "docx").',
        },
        customSite: {
          type: 'string',
          description: 'Custom domain when platform is "custom" (e.g. "news.ycombinator.com").',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to extract (default 10, max 50).',
        },
      },
      required: ['platform'],
    },
  },
  {
    name: 'start_workflow_recording',
    description:
      'Starts an interactive Playwright manual recording session on a target URL to capture clicks, inputs, submits, and navigation steps.',
    inputSchema: {
      type: 'object',
      properties: {
        targetUrl: {
          type: 'string',
          description: 'The target website URL to start recording interactions on.',
        },
      },
      required: ['targetUrl'],
    },
  },
  {
    name: 'stop_workflow_recording',
    description:
      'Stops an active recording session, automatically compiles interactions into a professional JSON workflow, and saves it to the bidirectional volume mount.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The active recording session ID returned by start_workflow_recording.',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'describe_and_generate_workflow',
    description:
      'Allows user to describe workflow changes in natural language. Uses JSON schema defaults and validates/revalidates against Ollama to generate and save a verified professional workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        userDescription: {
          type: 'string',
          description: 'Detailed description of the workflow actions, inputs, extractions, or changes required.',
        },
        baseUrl: {
          type: 'string',
          description: 'Base URL for the target web application (e.g. "https://example.com").',
        },
        customName: {
          type: 'string',
          description: 'Optional custom name or slug for the workflow file.',
        },
      },
      required: ['userDescription'],
    },
  },
  {
    name: 'list_recorded_workflows',
    description:
      'Lists all JSON workflows currently stored in the bidirectional mounted workflows volume.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'extract_and_save_job_requirement',
    description:
      'Extracts LinkedIn job details, analyzes and structures the requirements with Ollama, saves a Markdown file, and persists to PostgreSQL database.',
    inputSchema: {
      type: 'object',
      properties: {
        jobTitle: { type: 'string', description: 'Job Title (e.g. Solution Architect, Software Engineer)' },
        companyName: { type: 'string', description: 'Hiring Company Name' },
        location: { type: 'string', description: 'Job Location' },
        linkedinUrl: { type: 'string', description: 'Direct LinkedIn job posting URL' },
        rawDescription: { type: 'string', description: 'Complete raw job description text from the page' },
        jobId: { type: 'string', description: 'Optional Job ID' },
        workplaceType: { type: 'string', description: 'Remote, Hybrid, or On-site' },
      },
      required: ['jobTitle', 'companyName', 'linkedinUrl', 'rawDescription'],
    },
  },
  {
    name: 'list_job_requirements',
    description:
      'Queries and returns all structured job requirements from PostgreSQL mb_job_requirements sorted strictly by time first listed on portal (first_listed_at DESC), including official site apply URLs and LinkedIn URLs.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_auth_cookies',
    description:
      'Inspects and returns the status of saved browser cookies and storage state (count, domains, last updated) from the bidirectional volume storage_state.json.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'import_auth_cookies',
    description:
      'Imports authentication cookies (e.g. from Chrome DevTools, EditThisCookie, or manual session) into the bidirectional storage_state.json so MCP browser sessions stay authenticated.',
    inputSchema: {
      type: 'object',
      properties: {
        cookies: {
          type: 'array',
          description: 'Array of cookie objects with name, value, domain, path, etc.',
          items: { type: 'object' },
        },
      },
      required: ['cookies'],
    },
  },
  {
    name: 'export_auth_cookies',
    description:
      'Exports the complete saved authentication state (cookies and localStorage origins) from the bidirectional storage_state.json.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];


