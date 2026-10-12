# 📑 Comprehensive Guide: Google Docs Profile Integration, Resume Customization & Automated Form Filling

This guide provides end-to-end instructions and practical tips for:
1. **Communicating with and selecting the best Ollama model** during recording and execution.
2. **Reviewing and matching applicant resumes** against extracted job requirements.
3. **Customizing the resume for Claude tools** and ATS optimization.
4. **Accessing Google Docs & Google Sheets (Excel)** to auto-fill online job application forms.

---

## 🧠 1. Ollama Model Selection Matrix

The system dynamically connects to the Ollama GPU service (`http://ollama-model-service-gpu:11434`) and selects the specialized model for each phase of the workflow:

| Workflow Phase | Recommended Model | Strengths & Capabilities |
| :--- | :--- | :--- |
| **Resume Matching & Gap Analysis** | `deepseek-r1:7b` | Exceptional chain-of-thought reasoning; identifies exact skill gaps, competency matches, and truthfulness without hallucinating matches. |
| **Resume Tailoring & Cover Letters** | `llama3.1:8b` | Natural human prose; top-loads high-impact ATS keywords; generates STAR-formatted bullet points compatible with Claude tools. |
| **Form Autofill & Codegen Analysis** | `qwen3-coder:latest` | Precision structured output; excels at DOM attribute extraction, selector fallback synthesis, and JSON validation. |
| **Fast Requirements Extraction** | `llama3.2:latest` | Ultra-fast lightweight extraction (~1.8 GB); parses job requirements in sub-second to 2-second windows. |

### How to Customize the Model During Recording / Workflows
You can override the model on any step or tool invocation by specifying the `targetModel` parameter:
```json
{
  "id": "step-match-resume",
  "action": "match_resume",
  "resumeMatchOptions": {
    "targetModel": "deepseek-r1:7b",
    "formatForClaude": true
  }
}
```

---

## 📊 2. Tips to Access Google Docs & Google Sheets (Excel)

When applying for roles, applicants often maintain their personal contact info, experience metrics, and answers to repetitive screening questions in a Google Sheet or Excel workbook in Google Drive. Here are the most effective ways to access and utilize this data:

### 💡 Tip 1: The Direct CSV Export Trick (Zero OAuth / No API Keys)
You don't need a complex Google Cloud Console project or OAuth service account to read data from Google Sheets:
1. In your Google Sheet, click **Share** -> **General Access** -> **Anyone with the link can view**.
2. Copy the sharing link (e.g., `https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing`).
3. The engine automatically converts it to the direct CSV export endpoint:
   ```
   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/export?format=csv&gid=0
   ```
4. **Targeting Specific Tabs**: If your profile is on a second tab, append the `gid`:
   ```
   https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/export?format=csv&gid=123456789
   ```

### 💡 Tip 2: Direct Plain Text Export for Google Docs Resumes
If your raw resume is stored as a formatted Google Doc:
1. Ensure the Google Doc is shared as "Anyone with the link can view".
2. Convert the URL format to:
   ```
   https://docs.google.com/document/d/<DOCUMENT_ID>/export?format=txt
   ```
3. The engine streams the clean text directly into Ollama for review, matching, and tailoring.

### 💡 Tip 3: Accessing Private / Corporate Google Drives via Saved Browser State
If your Google Sheet cannot be made publicly viewable due to privacy or corporate SSO:
1. Start the interactive noVNC recording session:
   ```bash
   docker exec -d modelbox-playwright-mcp bash /app/config/scripts/run-interactive-recorder.sh https://accounts.google.com
   ```
2. Open `http://localhost:6080/vnc.html` and log in to Google.
3. Save the authenticated storage state to `/app/workflows/storage_state.json`.
4. Subsequent Playwright engine workflows reuse this storage state, reading private Google Docs with zero permission barriers.

### 💡 Tip 4: Optimal Google Sheet Schema for 100% Autofill Precision
The engine supports both **Key-Value** and **Tabular** sheet structures:

#### Option A: Key-Value Format (Recommended for single applicants)
Create a 2-column Google Sheet with:
| Field Name (Column A) | Value (Column B) |
| :--- | :--- |
| `First Name` | Punit |
| `Last Name` | Tiwari |
| `Email` | punit@example.com |
| `Phone` | +91 98765 43210 |
| `LinkedIn` | https://www.linkedin.com/in/punittiwari |
| `GitHub` | https://github.com/punittiwari |
| `Current Title` | Lead Software Engineer |
| `Years of Experience` | 8 |
| `City` | Mumbai |
| `Country` | India |
| `Work Authorization` | Yes |
| `Require Sponsorship` | No |
| `Notice Period` | 30 |
| `Current CTC` | INR 35,00,000 |
| `Expected CTC` | INR 50,00,000 |
| `Willing to Relocate` | Yes |

#### Option B: Tabular Format (For multiple candidate profiles or job-hunt tracking)
Row 1 contains column headers; Row 2 contains candidate details.

---

## ⚡ 3. Automated Online Form Filling Engine (`autofill_form`)

When executing an online application (LinkedIn Easy Apply, Workday, Greenhouse, Lever, Taleo, etc.), the `autofill_form` action automatically matches page fields against your Google Docs profile.

### Workflow Step Definition:
```json
{
  "id": "step-autofill-application",
  "action": "autofill_form",
  "description": "Autofill job application form from Google Sheet profile",
  "formAutofillOptions": {
    "googleSheetUrl": "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit",
    "resumeFilePath": "/app/downloads/resume.pdf",
    "submitAfterFill": false
  },
  "timeoutMs": 30000,
  "continueOnError": true
}
```

### Semantic Matching Logic
The engine scans every visible input, select dropdown, radio group, and textarea, matching across:
- `name`, `id`, `placeholder`, `aria-label`, `autocomplete`
- Associated `<label for="...">` and parent text

Supported automated fields:
- Personal: Name, First Name, Last Name, Email, Phone
- Professional: LinkedIn URL, Portfolio, Current Title, Total Experience
- Geographic: Address, City, State, Postal Code, Country
- Compliance & Screening: Legal Work Authorization (Yes/No), Visa Sponsorship (Yes/No), Notice Period, Relocation Willingness, Salary Expectations
- Attachments: Uploads `resume.pdf` automatically if an `input[type="file"]` exists.

---

## 🤝 4. Resume Customization for Claude Tools

The `customize_resume_for_role` tool transforms your baseline profile into an ATS-optimized, Claude-tool-ready package:

1. **Artifact Generation**: Saves a formatted Markdown document to `workflows/custom_resumes/<company>_<role>_customized_resume.md`.
2. **Claude Tool Payload**: Returns a structured JSON object designed for direct consumption by Claude Desktop MCP clients or Claude agent tools:
   ```json
   {
     "type": "tailored_resume_artifact",
     "targetRole": "Lead Software Engineer",
     "targetCompany": "NetApp",
     "headline": "Lead Software Engineer | Cloud Distributed Systems & Kubernetes",
     "summary": "Accomplished Software Engineer with 8+ years leading high-throughput cloud storage architectures...",
     "skills": ["C++", "Go", "Python", "Kubernetes", "AWS", "Microservices"],
     "experienceBullets": [
       "Architected cloud storage microservices reducing p99 latency by 35%.",
       "Engineered automated CI/CD pipelines deploying Docker containers across multi-region Kubernetes clusters."
     ],
     "coverLetter": "Dear Hiring Team at NetApp...",
     "markdownPath": "/app/workflows/custom_resumes/netapp_lead_software_engineer_customized_resume.md"
   }
   ```

---

## 🚀 5. Quick CLI & REST Examples

### Fetch Profile from Google Sheet:
```bash
docker exec modelbox-playwright-mcp node -e "
fetch('http://127.0.0.1:8940/api/workflow/google-docs/fetch-profile?url=https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit')
  .then(r => r.json())
  .then(console.log);
"
```

### Match Resume Against Role:
```bash
docker exec modelbox-playwright-mcp node -e "
fetch('http://127.0.0.1:8940/api/workflow/resume/match', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resumeText: 'Lead Engineer with 8 years in C++, Go, Kubernetes, Cloud storage...',
    jobTitle: 'Lead Software Engineer',
    companyName: 'NetApp',
    jobDescription: 'Seeking Lead Software Engineer with experience in C++, Go, Python, distributed systems...',
    model: 'deepseek-r1:7b'
  })
}).then(r => r.json()).then(console.log);
"
```

### Customize Resume for Claude Tools:
```bash
docker exec modelbox-playwright-mcp node -e "
fetch('http://127.0.0.1:8940/api/workflow/resume/customize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resumeText: 'Experienced Software Engineer in cloud architecture and microservices...',
    jobTitle: 'Solutions Architect',
    companyName: 'Vertiv',
    jobDescription: 'Seeking Solutions Architect for critical power and data center infrastructure...',
    model: 'llama3.1:8b'
  })
}).then(r => r.json()).then(console.log);
"
```
