import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
const pyodideWorker = new Worker("./pyworker.js", { type: "module" });
const marked = new Marked();

// DOM Elements
const questionForm = document.getElementById("questionForm");
const questionInput = document.getElementById("questionInput");
const loadingSpinner = document.getElementById("loadingSpinner");
const loadingMessage = document.getElementById("loadingMessage");
const errorAlert = document.getElementById("errorAlert");
const errorMessage = document.getElementById("errorMessage");
const expertsContainer = document.getElementById("expertsContainer");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileList = document.getElementById("fileList");
const chatContainer = document.getElementById("chatContainer");
const followupContainer = document.getElementById("followupContainer");
const viewAllDataBtn = document.getElementById("viewAllDataBtn");
const viewMindmapBtn = document.getElementById("viewMindmapBtn");
const downloadCsvBtn = document.getElementById("downloadCsv");
const downloadXlsxBtn = document.getElementById("downloadXlsx");
const container = document.getElementById('jsmind_container');
const mainContent = document.getElementById('mainContent');
const apiForm = document.getElementById('apiForm');
let currentAnalysisData = null;
let currentQuestion = null;
let key = null;
let token_url = null;
let openai_url = null;
let gemini_url = null;
let currentExpertsData=[];
let sheetData=[];
// Check for stored API URLs
function checkStoredAPIs() {
    const stored_token_url = localStorage.getItem('token_url');
    const stored_openai_url = localStorage.getItem('openai_url');
    const stored_gemini_url = localStorage.getItem('gemini_url');
    
    if (stored_token_url && stored_openai_url && stored_gemini_url) {
        token_url = stored_token_url;
        openai_url = stored_openai_url;
        gemini_url = stored_gemini_url;
        return true;
    }
    return false;
}

// Show API form
function showAPIForm() {
    apiForm.classList.remove('hidden');
    mainContent.classList.add('hidden');
}

// Handle API form submission
async function handleAPISubmit(event) {
    event.preventDefault();
    const tokenApiInput = document.getElementById('tokenApi');
    const openaiApiInput = document.getElementById('openaiApi');
    const geminiApiInput = document.getElementById('geminiApi');
    
    token_url = tokenApiInput.value;
    openai_url = openaiApiInput.value;
    gemini_url = geminiApiInput.value;
    
    // Store in localStorage
    localStorage.setItem('token_url', token_url);
    localStorage.setItem('openai_url', openai_url);
    localStorage.setItem('gemini_url', gemini_url);
    
    // Hide form and show main content
    apiForm.classList.add('hidden');
    mainContent.classList.remove('hidden');
    
    // Initialize the app
    await init();
}

async function init() {
    try {
        if (!checkStoredAPIs()) {
            showAPIForm();
            return;
        }
        
        const response = await fetch(token_url, { credentials: "include" });
        const data = await response.json();
        key = data.token;
        
        // Show main content if we have the token
        mainContent.classList.remove('hidden');
        apiForm.classList.add('hidden');
    } catch (error) {
        showError("Failed to initialize: " + error.message);
    }
}

// Add form submit listener
apiForm.addEventListener('submit', handleAPISubmit);

init();

// Function to get appropriate icon class based on file type
const getFileIcon = (filename) => {
  const icons = {
    xlsx: "spreadsheet text-success",
    xls: "spreadsheet text-success",
    csv: "text text-success",
    pdf: "pdf text-danger",
    doc: "word text-primary",
    docx: "word text-primary",
  };
  return `bi bi-file-earmark-${
    icons[filename.split(".").pop().toLowerCase()] || "text"
  }`;
};

// Store conversation history
let conversationHistory = [];

// Store extracted data from files
let extractedData = {
  pdfs: [],
  excel: [],
  csv: [],
  docx: [],
};

// Show loading state
function showLoading(message) {
  loadingMessage.textContent = message;
  loadingSpinner.classList.remove("hidden");
}

// Hide loading state
function hideLoading() {
  loadingSpinner.classList.add("hidden");
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorAlert.classList.remove("hidden");
}

// Call OpenAI API
async function callOpenAI(systemPrompt, userMessage) {
  try {
    const response = await fetch(openai_url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "API error occurred");
    }

    return data.choices?.[0]?.message?.content || "No response received";
  } catch (error) {
    throw new Error(`API call failed: ${error.message}`);
  }
}

// Store current mindmap data
let currentFinalmapData = null;

// Function to generate mindmap data for jsMind
async function generateFinalmapData(question, expertsData) {
  const systemPrompt = `You are an expert at creating cumulative mindmaps. Given a question and multiple experts' analyses, 
  create a hierarchical mindmap structure that combines insights from all experts. The structure should be in jsMind format.
  Direction should always be right.

  Return a JSON object in this exact format:
  {
    "meta": {
      "name": "Question Summary",
      "author": "AI Assistant",
      "version": "1.0"
    },
    "format": "node_tree",
    "data": {
      "id": "root",
      "topic": "Main Question",
      "children": [
        {
          "id": "theme1",
          "topic": "Key Theme 1",
          "direction": "right",
          "children": [
            {
              "id": "expert1_insight1",
              "topic": "Expert 1: Specific insight",
              "direction": "right"
            }
          ]
        }
      ]
    }
  }`;

  const userMessage = `Question: "${question}"
Experts Analysis:
${expertsData.map(expert => `
Expert: ${expert.name} (${expert.role})
Q&A: ${JSON.stringify(expert.questionsAndAnswers, null, 2)}
Summary: ${expert.summary}
`).join('\n')}

Generate a cumulative mindmap structure that synthesizes insights from all experts.
Make sure to:
1. Set the root topic as the main question
2. Group insights by common themes
3. Label each insight with the expert's name
4. Keep topics concise but informative
5. Direction should always be right`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    const mindmapData = JSON.parse(response);
    viewMindmapBtn.classList.remove("d-none");
    return mindmapData;
  } catch (error) {
    console.error("Failed to generate mindmap data:", error);
    throw error;
  }
}

// Function to render mindmap using jsMind
function renderFinalmap(mindmapData) {
  // Clear existing content
  container.innerHTML = '';

  // Initialize jsMind options
  const options = {
    container: 'jsmind_container',
    theme: 'primary',
    editable: false,
    support_html: true,
    view: {
      hmargin: 100,
      vmargin: 50,
      line_width: 2,
      line_color: '#2196F3',
      draggable: true,
      hide_scrollbars_when_mouse_out: true
    },
    layout: {
      hspace: 120,
      vspace: 30,
      pspace: 13
    }
  };

  // Show modal first
  const mindmapModal = new bootstrap.Modal(document.getElementById('mindmapModal'));
  mindmapModal.show();

  // Create and show mindmap after modal is shown
  document.getElementById('mindmapModal').addEventListener('shown.bs.modal', function() {
    // Initialize jsMind
    const jm = new jsMind(options);
    
    // Show mindmap data
    try {
      jm.show(mindmapData);
      currentFinalmapData = mindmapData;
      
      // Force resize after a short delay
      setTimeout(() => {
        if (jm && typeof jm.resize === 'function') {
          jm.resize();
        }
      }, 200);
    } catch (error) {
      console.error('Error showing mindmap:', error);
      showError('Failed to display mindmap. Please try again.');
    }
  }, { once: true });
}

// Function to handle view mindmap button click
async function handleViewFinalmap() {
  if (!currentFinalmapData) {
    showError('No mindmap data available yet. Please ask a question first.');
    return;
  }
  renderFinalmap(currentFinalmapData);
}

viewMindmapBtn.addEventListener("click", handleViewFinalmap);

// Get experts for the roundtable
async function getExperts(question) {
  showLoading("Identifying expert panel...");

  const systemPrompt = `
    You are an assistant tasked with identifying 3 experts for a roundtable discussion
    on a specific question. These experts should be relevant to analyzing clinical development
    and drug trial data, focusing on aspects important to a Clinical Development Director.
    
    Consider the full conversation history when selecting experts, as the current question may relate 
    to previous discussion points about clinical trials, drug development, or patient outcomes.
    
    For the given question, conversation history, and document context, suggest 3 distinct experts who would
    have valuable perspectives on clinical development. Each expert should have different specialties
    and backgrounds to ensure comprehensive insights into trial design, safety, efficacy, and regulatory aspects.

    The experts should be able to analyze and interpret:
    - Clinical trial data and documentation
    - Safety and efficacy metrics
    - Statistical patterns and relationships
    - Regulatory compliance requirements
    - Protocol design considerations
    - Patient outcomes and adverse events
    - Historical trial data and trends

    Select from relevant specialties such as:
    - Clinical Trial Design
    - Biostatistics
    - Medical Safety
    - Regulatory Affairs
    - Clinical Operations
    - Data Management
    - Patient Safety
    - Medical Affairs

    Provide your response in JSON format with the following structure:
    {
      "experts": [
        {
          "title": "Expert's title/profession",
          "specialty": "Expert's area of expertise",
          "background": "Brief 1-2 sentence background on why this expert is relevant and what they bring to the table with respect to the question, documents, and conversation history"
        },
        {...},
        {...}
      ]
    }
  `;

  const conversationContext = getConversationContext();
  const userMessage = `
    Question: ${question}

    Previous Conversation:
    ${conversationContext}

    Available document content:
    ${extractedData.pdfs
      .map((pdf) => `PDF: ${pdf.filename}\nContent: ${pdf.content}`)
      .join("\n\n")}
    ${extractedData.excel
      .map(
        (excel) =>
          `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`
      )
      .join("\n\n")}
    ${extractedData.csv
      .map(
        (csv) => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`
      )
      .join("\n\n")}
    ${extractedData.docx
      .map((docx) => `DOCX: ${docx.filename}\nContent: ${docx.content}`)
      .join("\n\n")}
  `;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return JSON.parse(response).experts;
  } catch (error) {
    throw new Error(`Failed to identify experts: ${error.message}`);
  }
}

// Generate questions for each expert
async function generateExpertQuestions(question, expert) {
  const systemPrompt = `
    You are an assistant tasked with generating 3 insightful questions related to the user's
    main question. These questions should be specialized for ${expert.title}
    with expertise in ${expert.specialty}, focusing on clinical development aspects.

    Context: The user is a Clinical Development Director analyzing clinical data and outcomes.
    
    Generate questions that:
    1. Leverage this expert's clinical expertise in relation to:
       - Trial design and methodology
       - Safety and efficacy metrics
       - Regulatory compliance
       - Patient outcomes
    2. Focus on analyzing clinical data patterns and trends
    3. Help extract insights relevant to drug development decisions
    4. Address specific aspects of:
       - Statistical significance
       - Protocol adherence
       - Adverse events
       - Treatment effectiveness
    5. Consider implications for:
       - Future trial design
       - Safety monitoring
       - Regulatory submissions
       - Clinical practice

    Your questions should be clear, specific, and directly related to clinical development aspects of the available data.
    Focus on generating actionable insights for clinical trial optimization and drug development.
  `;

  const documentContext = `
    Available document content:
    ${extractedData.pdfs
      .map((pdf) => `PDF: ${pdf.filename}\nContent: ${pdf.content}`)
      .join("\n\n")}
    ${extractedData.excel
      .map(
        (excel) =>
          `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`
      )
      .join("\n\n")}
    ${extractedData.csv
      .map(
        (csv) => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`
      )
      .join("\n\n")}
    ${extractedData.docx
      .map((docx) => `DOCX: ${docx.filename}\nContent: ${docx.content}`)
      .join("\n\n")}
  `;

  try {
    const response = await callOpenAI(
      systemPrompt,
      `Question: ${question}\n\nDocument Context:\n${documentContext}\n\nExpert Background: ${expert.background}`
    );
    return response.split("\n").filter((q) => q.trim());
  } catch (error) {
    throw new Error(
      `Failed to generate questions for ${expert.title}: ${error.message}`
    );
  }
}

// Get expert answers
async function getExpertAnswers(question, expert, expertQuestions) {
  const systemPrompt = `
    You are ${expert.title}, an expert in ${expert.specialty}. 
    ${expert.background}

    As a clinical development expert, analyze the provided data and answer the following questions.
    Your answers should:
    1. Focus on clinical relevance and implications:
       - Safety and efficacy outcomes
       - Statistical significance of findings
       - Protocol compliance insights
       - Patient-centric considerations
    
    2. Reference specific clinical data points:
       - Trial outcomes and metrics
       - Adverse event patterns
       - Treatment effectiveness indicators
       - Protocol adherence measures
    
    3. Provide evidence-based insights for:
       - Clinical decision-making
       - Trial design optimization
       - Risk mitigation strategies
       - Regulatory considerations
    
    4. Consider implications for:
       - Future trial protocols
       - Safety monitoring procedures
       - Regulatory submissions
       - Clinical practice guidelines

    Format your responses to highlight:
    - Key clinical findings
    - Statistical significance
    - Safety signals
    - Recommendations for clinical development
  `;

  const documentContext = `
    Available document content:
    ${extractedData.pdfs
      .map((pdf) => `PDF: ${pdf.filename}\nContent: ${pdf.content}`)
      .join("\n\n")}
    ${extractedData.excel
      .map(
        (excel) =>
          `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`
      )
      .join("\n\n")}
    ${extractedData.csv
      .map(
        (csv) => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`
      )
      .join("\n\n")}
    ${extractedData.docx
      .map((docx) => `DOCX: ${docx.filename}\nContent: ${docx.content}`)
      .join("\n\n")}
  `;

  try {
    const response = await callOpenAI(
      systemPrompt,
      `Main Question: ${question}\n\nDocument Context:\n${documentContext}\n\nQuestions to Answer:\n${expertQuestions.join(
        "\n"
      )}`
    );
    return response.split("\n").filter((a) => a.trim());
  } catch (error) {
    throw new Error(
      `Failed to get answers from ${expert.title}: ${error.message}`
    );
  }
}

// Generate expert summary
async function generateExpertSummary(question, expert, questionsAndAnswers) {
  const systemPrompt = `
    You are an assistant tasked with summarizing the insights provided by ${expert.name},
    a ${expert.title} with expertise in ${expert.specialty}.

    Review the expert's answers to the specialized questions and create a concise summary
    of their key points and contributions to addressing the main question.

    The summary should be 2-3 paragraphs and highlight the unique perspective this expert brings.
  `;

  const userMessage = `
    Main question: ${question}

    Expert: ${expert.name}, ${expert.title}
    Specialty: ${expert.specialty}
    Background: ${expert.background}

    Q&A:
    ${questionsAndAnswers
      .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
      .join("\n\n")}
  `;

  try {
    return await callOpenAI(systemPrompt, userMessage);
  } catch (error) {
    throw new Error(
      `Failed to generate summary for ${expert.name}: ${error.message}`
    );
  }
}

// Helper to extract mermaid code from LLM response
function extractMermaidCode(response) {
  try {
    const mermaidMatch = response.match(/```mermaid\s*([\s\S]*?)```/i);
    if (!mermaidMatch || !mermaidMatch[1]) {
      console.warn("No mermaid code block found in response");
      return null;
    }
    const code = mermaidMatch[1].trim();
    if (!code.startsWith("mindmap")) {
      console.warn("Invalid mindmap code - does not start with mindmap");
      return null;
    }
    return code;
  } catch (error) {
    console.error("Error extracting mermaid code:", error);
    return null;
  }
}

// Generate expert mindmap using LLM (after final answer)
async function generateExpertMindmapWithLLM(
  question,
  expert,
  questionsAndAnswers,
  finalAnswer
) {
  const systemPrompt = `
You are an assistant tasked with creating a Mermaid mindmap visualization. Follow these rules precisely:

1. Format:
   - First line: \`\`\`mermaid
   - Second line: mindmap
   - Use 2 spaces for each indentation level
   - Root node: (( )) notation
   - Child nodes: plain text without special formatting

2. Content Rules:
   - Use only alphanumeric characters and basic punctuation
   - Avoid hyphens (-) at start of lines
   - Keep node text concise (max 40 characters)
   - No special characters or Unicode
   - No HTML or markdown

Example Structure:
\`\`\`mermaid
mindmap
  root((Expert Analysis))
    Finding 1
      Detail A
      Detail B
    Finding 2
      Detail C
\`\`\`

Create a focused mindmap showing the expert's key findings and their connection to the final answer.
ONLY output the mermaid code block, nothing else.`;

  const userMessage = `
Context:
Expert: ${expert.title}
Specialty: ${expert.specialty}
Question: ${question}

Analysis:
${questionsAndAnswers
  .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
  .join("\n\n")}

Summary: ${expert.summary}
Conclusion: ${finalAnswer}

Guidelines:
1. Root: Expert's role as central node
2. Level 1: Key findings/themes
3. Level 2: Supporting evidence
4. Level 3: Connection to final answer`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return extractMermaidCode(response);
  } catch (error) {
    console.error(`Failed to generate mindmap for ${expert.title}:`, error);
    return null;
  }
}

// Generate final answer
async function generateFinalAnswer(question, expertsData) {
  showLoading("Synthesizing final answer...");

  const systemPrompt = `
    You are an assistant tasked with synthesizing expert insights into a comprehensive answer.
    Consider the full conversation history when formulating your response, as the current question
    may relate to or build upon previous exchanges.
    
    Your response should:
    1. Address the current question directly
    2. Reference relevant points from previous conversation
    3. Integrate expert insights and document evidence
    4. Maintain consistency with previous answers
    5. Clarify any relationships with previous topics discussed
  `;

  const conversationContext = getConversationContext();
  const userMessage = `
    Current Question: ${question}

    Previous Conversation:
    ${conversationContext}

    Expert Insights:
    ${expertsData
      .map(
        (expert) => `
        Expert: ${expert.title} (${expert.specialty})
        Background: ${expert.background}
        Key Questions and Answers:
        ${expert.questionsAndAnswers
          .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
          .join("\n")}
        Summary: ${expert.summary}
      `
      )
      .join("\n\n")}

    Document Context:
    ${extractedData.pdfs
      .map((pdf) => `PDF: ${pdf.filename}\nContent: ${pdf.content}`)
      .join("\n\n")}
    ${extractedData.excel
      .map(
        (excel) =>
          `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`
      )
      .join("\n\n")}
    ${extractedData.csv
      .map(
        (csv) => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`
      )
      .join("\n\n")}
    ${extractedData.docx
      .map((docx) => `DOCX: ${docx.filename}\nContent: ${docx.content}`)
      .join("\n\n")}
  `;

  try {
    return await callOpenAI(systemPrompt, userMessage);
  } catch (error) {
    throw new Error(`Failed to generate final answer: ${error.message}`);
  }
}

// Function to convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = (error) => reject(error);
  });
}

// Function to extract text from PDF using Gemini
async function extractPdfData(file) {
  try {
    const base64Data = await fileToBase64(file);
    const response = await fetch(gemini_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "Extract the text content from the provided PDF." }],
        },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "application/pdf", data: base64Data } },
            ],
          },
        ],
      }),
    });
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Error extracting PDF:", error);
    throw new Error(`Failed to extract PDF data: ${error.message}`);
  }
}

// Function to extract data from Excel files
async function extractExcelData(file) {
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
    type: "array",
  });
  workbook.SheetNames.forEach((sheetName) => {
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
    });
    sheetData.push({ fileName: file.name, sheetName, data: jsonData });
  });
  extractedData.excel.push({ fileName: file.name, content: workbook });
  return workbook;
}

// Function to extract data from CSV files
async function extractCsvData(file) {
  const csvData = await file.text();
  const workbook = XLSX.read(csvData, { type: "string" });
  const sheetName = workbook.SheetNames[0];
  const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
  });
  sheetData.push({ fileName: file.name, sheetName: "Sheet1", data: jsonData });
  extractedData.csv.push({ fileName: file.name, content: jsonData });
  return jsonData;
}

// Function to extract data from DOCX files
async function extractDocxData(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const docxText = result.value;
    return docxText;
  } catch (error) {
    console.error("Error extracting DOCX:", error);
    throw new Error(`Failed to extract DOCX data: ${error.message}`);
  }
}

// Function to handle file upload
async function handleFileUpload(files) {
  showLoading("Processing Files...");
  sheetData = [];
  extractedData = { pdfs: [], excel: [], csv: [], docx: [] };
  try {
    fileList.innerHTML = "";
    let hasSpreadsheetFiles = false;
    for (const file of files) {
      const listItem = document.createElement("li");
      listItem.className = "file-item mb-2 d-flex align-items-center";
      listItem.appendChild(
        Object.assign(document.createElement("i"), {
          className: getFileIcon(file.name),
        })
      );
      listItem.appendChild(
        Object.assign(document.createElement("span"), {
          className: "ms-2 me-auto",
          textContent: file.name,
        })
      );
      fileList.appendChild(listItem);
      const ext = file.name.split(".").pop().toLowerCase();
      try {
        if (["xlsx", "xls"].includes(ext)) {
          await extractExcelData(file);
          hasSpreadsheetFiles = true;
        } else if (ext === "csv") {
          await extractCsvData(file);
          hasSpreadsheetFiles = true;
        } else if (ext === "pdf") {
          const pdfText = await extractPdfData(file);
          extractedData.pdfs.push({ filename: file.name, content: pdfText });
        } else if (ext === "docx") {
          const docxText = await extractDocxData(file);
          extractedData.docx.push({ filename: file.name, content: docxText });
        } else {
          console.warn(`Unsupported file type: ${ext}`);
        }
        listItem.appendChild(
          Object.assign(document.createElement("i"), {
            className: "bi bi-check-circle-fill text-success ms-2",
          })
        );
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        listItem.appendChild(
          Object.assign(document.createElement("i"), {
            className: "bi bi-exclamation-circle-fill text-danger ms-2",
            title: "Error processing file",
          })
        );
      }
    }
    viewAllDataBtn.style.display = hasSpreadsheetFiles
      ? "inline-block"
      : "none";
    fileInfo.classList.remove("hidden");
    fileName.textContent = `${files.length} file(s) uploaded successfully`;
    document.getElementById("questionInput").disabled = false;
    document.querySelector("#questionForm button").disabled = false;
    await generateInitialInsights();
    return extractedData;
  } catch (error) {
    console.error("Error processing files:", error);
    showError("Error processing files. Please try again.");
    throw error;
  }
}

// Update file input event listener
fileInput.addEventListener("change", async (e) => {
  if (e.target.files.length)
    try {
      await handleFileUpload(e.target.files);
      hideLoading();
    } catch (err) {
      showError(err.message);
    }
});

// Function to show all data in modal
async function showAllData() {
  const table = document.getElementById("analysisResultTable");
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  if (currentAnalysisData && Array.isArray(currentAnalysisData) && currentAnalysisData.length > 0) {
    // Show analysis results
    displayAnalysisTable(currentAnalysisData);
  } else if (sheetData.length > 0) {
    // Show uploaded Excel/CSV data
    displayUploadedData();
  } else {
    tbody.innerHTML = '<tr><td colspan="100%" class="text-center">No data available</td></tr>';
    
    // Disable download buttons
    const downloadCsvBtn = document.getElementById('downloadCsv');
    const downloadXlsxBtn = document.getElementById('downloadXlsx');
    if (downloadCsvBtn && downloadXlsxBtn) {
      downloadCsvBtn.disabled = true;
      downloadXlsxBtn.disabled = true;
    }
  }

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('dataTablesModal'));
  modal.show();
}

// Function to display uploaded Excel/CSV data
function displayUploadedData() {
  const table = document.getElementById("analysisResultTable");
  const tbody = table.querySelector('tbody');

  sheetData.forEach((sheet, sheetIndex) => {
    // Add file header
    const fileHeaderRow = document.createElement('tr');
    const fileHeaderCell = document.createElement('th');
    fileHeaderCell.colSpan = 100;
    fileHeaderCell.className = 'bg-light';
    fileHeaderCell.style.padding = '10px';
    fileHeaderCell.innerHTML = `<i class="bi bi-file-earmark-spreadsheet me-2"></i>${sheet.fileName} - ${sheet.sheetName}`;
    fileHeaderRow.appendChild(fileHeaderCell);
    tbody.appendChild(fileHeaderRow);

    // Add data headers
    if (sheet.data.length > 0) {
      const headerRow = document.createElement('tr');
      sheet.data[0].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header || '';
        th.style.padding = '10px';
        th.style.fontWeight = 'bold';
        headerRow.appendChild(th);
      });
      tbody.appendChild(headerRow);
    }

    // Add data rows
    sheet.data.slice(1).forEach(row => {
      const tr = document.createElement('tr');
      row.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = cell || '';
        td.style.padding = '8px';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    // Add spacing between sheets
    if (sheetIndex < sheetData.length - 1) {
      const spacerRow = document.createElement('tr');
      const spacerCell = document.createElement('td');
      spacerCell.colSpan = 100;
      spacerCell.style.height = '20px';
      spacerRow.appendChild(spacerCell);
      tbody.appendChild(spacerRow);
    }
  });

  // Disable download buttons for uploaded data view
  const downloadCsvBtn = document.getElementById('downloadCsv');
  const downloadXlsxBtn = document.getElementById('downloadXlsx');
  if (downloadCsvBtn && downloadXlsxBtn) {
    downloadCsvBtn.disabled = true;
    downloadXlsxBtn.disabled = true;
  }
}

// Function to display data in table
function displayAnalysisTable(data) {
  if (!data || !Array.isArray(data)) return;
  
  const table = document.getElementById("analysisResultTable");
  const tbody = table.querySelector('tbody');

  // Add analysis header
  const analysisHeaderRow = document.createElement('tr');
  const analysisHeaderCell = document.createElement('th');
  analysisHeaderCell.colSpan = 100;
  analysisHeaderCell.className = 'bg-primary text-white';
  analysisHeaderCell.style.padding = '10px';
  analysisHeaderCell.innerHTML = '<i class="bi bi-table me-2"></i>Analysis Results';
  analysisHeaderRow.appendChild(analysisHeaderCell);
  tbody.appendChild(analysisHeaderRow);

  // Create headers
  const headers = Object.keys(data[0]);
  const headerRow = document.createElement('tr');
  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.padding = '10px';
    th.style.fontWeight = 'bold';
    headerRow.appendChild(th);
  });
  tbody.appendChild(headerRow);

  // Create rows
  data.forEach(row => {
    const tr = document.createElement('tr');
    headers.forEach(header => {
      const td = document.createElement('td');
      const value = row[header];
      td.textContent = value !== null && value !== undefined ? value.toString() : '';
      td.style.padding = '8px';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Store data for downloads
  currentAnalysisData = data;
  
  // Enable download buttons
  const downloadCsvBtn = document.getElementById('downloadCsv');
  const downloadXlsxBtn = document.getElementById('downloadXlsx');
  if (downloadCsvBtn && downloadXlsxBtn) {
    downloadCsvBtn.disabled = false;
    downloadXlsxBtn.disabled = false;
  }
}

// Add event listener for view all data button
document
  .getElementById("viewAllDataBtn")
  .addEventListener("click", showAllData);

// Add message to conversation history
function addToHistory(message, isUser = true) {
  conversationHistory.push({
    role: isUser ? "user" : "assistant",
    content: message,
  });
}

// Get formatted conversation history for LLM context
function getConversationContext() {
  return conversationHistory
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join("\n\n");
}

// Function to add a message to the chat
function addChatMessage(message, isUser = false) {
  const div = Object.assign(document.createElement("div"), {
    className: `chat-message ${isUser ? "user-message" : "assistant-message"}`,
  });
  div.appendChild(
    Object.assign(document.createElement("div"), {
      className: "message-content",
      innerHTML: marked.parse(message),
    })
  );
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function addAnalysisResult(finalAnswer, expertsData, isFollowUp = false) {
  try {
    // Generate mindmap data

    expertsContainer.innerHTML = "";

    // Add thinking animation container
    const thinkingDiv = document.createElement("div");
    thinkingDiv.className = "thinking-animation";
    thinkingDiv.innerHTML = `
      <div class="thinking-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    expertsContainer.appendChild(thinkingDiv);

    // Create container for expert analysis
    const analysisDiv = Object.assign(document.createElement("div"), {
      className: "expert-analysis",
    });
    expertsContainer.appendChild(analysisDiv);

    // Function to simulate typing effect
    const typeText = async (element, text, speed = 0) => {
      let htmlContent = "";
      let textIndex = 0;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "<") {
          let tag = "<";
          i++;
          while (text[i] !== ">") {
            tag += text[i];
            i++;
          }
          tag += text[i]; // Include closing '>'
          htmlContent += tag;
        } else {
          htmlContent += text[i];
          textIndex++;
          element.innerHTML = htmlContent;
          element.style.fontSize = "14px";
          // Scroll into view smoothly as text is typed
          element.scrollIntoView({ behavior: "smooth", block: "end" });
          await new Promise((resolve) => setTimeout(resolve, speed));
        }
      }
    };

    if (expertsData) {
      // Expert analysis case - keep existing expert handling code
      showLoading("Generating cumulative mindmap...");
      currentFinalmapData = await generateFinalmapData(
        expertsData[0].question,
        expertsData
      );
      hideLoading();
      const expertReasoning = expertsData
        .map(
          (expert) =>
            `Based on the complexity of your question, I've selected <strong>${expert.title}</strong> who specializes in <strong>${expert.specialty}</strong>. Their background in <strong>${expert.background}</strong> makes them particularly qualified to provide insights on this matter.`
        )
        .join("\n\n");

      const reasoningDiv = document.createElement("div");
      reasoningDiv.className = "chat-message system-message mb-4";
      analysisDiv.appendChild(reasoningDiv);
      await typeText(reasoningDiv, expertReasoning);

      for (const expert of expertsData) {
        const card = document.createElement("div");
        card.className = "expert-card mb-4";
        analysisDiv.appendChild(card);

        const cardContent = `
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">${expert.title}</h5>
              <h6 class="card-subtitle mb-2 text-muted">${expert.specialty}</h6>
              <p class="card-text"><strong>Background:</strong> ${
                expert.background
              }</p>
              <div class="qa-section">
                ${expert.questionsAndAnswers
                  .map(
                    (qa) => `
                <div class="qa-item mb-3">
                  <div class="question"><strong>Q:</strong> ${qa.question}</div>
                  <div class="answer"><strong>A:</strong> ${qa.answer}</div>
                </div>
              `
                  )
                  .join("")}
              </div>
              <p class="expert-summary mt-3"><strong>Summary:</strong> ${
                expert.summary
              }</p>
              ${expert.mermaid ? `
                <div class="mindmap-section mt-4">
                  <h6 class="text-primary mb-3">
                    <i class="bi bi-diagram-3 me-2"></i>Analysis Mindmap
                  </h6>
                  <div class="mindmap-container" style="width: 100%; max-height: 400px; overflow: auto;">
                    <div class="mindmap" style="min-width: fit-content;"></div>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
        await typeText(card, cardContent);

        // Initialize mindmap if expert has one
        if (expert.mermaid) {
          const mindmapContainer = card.querySelector('.mindmap');
          try {
            mindmapContainer.innerHTML = expert.mermaid;
            await mermaid.init(undefined, mindmapContainer);
            
            // Make SVG responsive in card
            const svg = mindmapContainer.querySelector('svg');
            if (svg) {
              svg.style.width = '100%';
              svg.style.height = 'auto';
              svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            }

            // Setup click handler for mindmap section
            const mindmapSection = card.querySelector('.mindmap-section');
            mindmapSection.style.cursor = 'pointer';
            mindmapSection.onclick = async () => {
              // Create modal dynamically
              const modalHtml = `
                <div class="modal fade" tabindex="-1">
                  <div class="modal-dialog modal-xl modal-dialog-centered">
                    <div class="modal-content">
                      <div class="modal-header">
                        <h5 class="modal-title">
                          <i class="bi bi-diagram-3 me-2"></i>${expert.title}'s Analysis Mindmap
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                      </div>
                      <div class="modal-body p-4">
                        <div class="mindmap-modal" style="min-height: 70vh; overflow: auto;"></div>
                      </div>
                    </div>
                  </div>
                </div>
              `;

              const modalWrapper = document.createElement('div');
              modalWrapper.innerHTML = modalHtml;
              const modalElement = modalWrapper.firstElementChild;
              document.body.appendChild(modalElement);

              const modal = new bootstrap.Modal(modalElement);
              
              try {
                const modalMindmap = modalElement.querySelector('.mindmap-modal');
                const { svg } = await mermaid.render(`modal-mindmap-${Date.now()}`, expert.mermaid);
                modalMindmap.innerHTML = svg;
                
                const modalSvg = modalMindmap.querySelector('svg');
                if (modalSvg) {
                  modalSvg.style.width = '100%';
                  modalSvg.style.height = 'auto';
                  modalSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                }
                
                modal.show();

                modalElement.addEventListener('hidden.bs.modal', () => {
                  modal.dispose();
                  modalElement.remove();
                });
              } catch (error) {
                console.error('Failed to render modal mindmap:', error);
                modalElement.remove();
                alert('Failed to render mindmap in modal: ' + error.message);
              }
            };
          } catch (error) {
            console.error(`Failed to render mindmap for ${expert.title}:`, error);
            mindmapContainer.innerHTML = `
              <div class="alert alert-danger d-flex align-items-center">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                Failed to render mindmap: ${error.message}
              </div>`;
          }
        }
    }
    addChatMessage(finalAnswer);

    if (conversationHistory.length >= 2 && !isFollowUp) {
      const followUpQuestions = await generateFollowUpQuestions(
        conversationHistory[conversationHistory.length - 2].content,
        finalAnswer
      );
      addFollowUpQuestions(followUpQuestions);
    }
  } else {
    // Data analysis case - show code in analysis column and results in chat
    const analysisCard = document.createElement("div");
    analysisCard.className = "expert-card mb-4";
    analysisDiv.appendChild(analysisCard);

    // Extract Python code and add to analysis column
    const codeMatch = finalAnswer.match(/\`\`\`python\n([\s\S]*?)\`\`\`/);
    if (codeMatch) {
      const codeContent = `<div class="card">
        <div class="card-body">
          <pre><code class="language-python">${codeMatch[1]}</code></pre>
        </div>
      </div>`;
      await typeText(analysisCard, codeContent);
    }

    // Extract the formatted analysis (without Python code)
    const formattedContent = finalAnswer
      .replace(/\`\`\`python[\s\S]*?\`\`\`/, "")
      .trim();
    addChatMessage(formattedContent);
    // Generate follow-up questions using only the formatted analysis
    if (conversationHistory.length >= 2 && !isFollowUp) {
      const followUpQuestions = await generateFollowUpQuestions(
        conversationHistory[conversationHistory.length - 2].content,
        formattedContent // Pass only the formatted analysis without Python code
      );
      addFollowUpQuestions(followUpQuestions);
    }
  }

  // Remove thinking animation
  thinkingDiv.remove();
} catch (error) {
  console.error("Failed to add analysis result:", error);
  showError(error.message);
}
}

async function generateFollowUpQuestions(question, finalAnswer) {
  const systemPrompt = `You are an AI assistant helping a Clinical Development Director analyze clinical data.
  Based on the previous question and answer, suggest 3 relevant follow-up questions.
  
  For clinical data analysis:
  - Focus on safety and efficacy metrics
  - Analyze patient outcomes and subgroup performance
  - Investigate adverse event patterns and trends
  - Consider statistical significance of findings
  - Examine protocol compliance indicators
  - Compare results across trial phases or cohorts
  
  For clinical development insights:
  - Focus on implications for trial design
  - Consider regulatory requirements and submissions
  - Evaluate safety monitoring strategies
  - Assess protocol optimization opportunities
  - Explore impact on clinical practice
  - Address risk mitigation approaches
  
  Ensure questions are:
  1. Relevant to clinical development decisions
  2. Focused on actionable insights
  3. Aligned with regulatory requirements
  4. Based on evidence from the data
  
  Return questions in a JSON array format:
  {
    "type": "object",
    "properties": {
      "questions": {
        "type": "array",
        "items": {
        "type": "string"
        }
      }
    },
    "required": ["questions"]
  }`;

  const userMessage = `Previous Question: ${question}\n\nAnswer: ${finalAnswer}\n\nGenerate 3 relevant follow-up questions.`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    let questions;
    try {
      questions = JSON.parse(response).questions;
    } catch {
      // If response isn't valid JSON, try to extract array from markdown
      const match = response.match(/\[[\s\S]*\]/);
      questions = match ? JSON.parse(match[0]) : [];
    }

    return questions.slice(0, 3); // Ensure we only return 3 questions
  } catch (error) {
    console.error("Failed to generate follow-up questions:", error);
    return [];
  }
}

// Add follow-up questions to the UI
function addFollowUpQuestions(questions) {
  if (!questions || !questions.length) return;

  followupContainer.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "follow-up-questions mt-1";

  const list = document.createElement("div");
  list.className = "d-flex flex-column gap-2";

  questions.forEach((question) => {
    const button = document.createElement("button");
    button.className = "btn btn-outline-primary text-start";
    button.textContent = question;
    currentQuestion = question;
    button.onclick = () => {
      questionInput.value = '';
      processQuestion(question, true);
    };
    list.appendChild(button);
  });

  wrapper.appendChild(list);
  followupContainer.appendChild(wrapper);
}

questionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = questionInput.value.trim();
  questionInput.value = "";
  if (!question) return;
  currentQuestion = question;
  processQuestion(question, false); // Pass false to indicate it's a new question
});

// Process the question
async function processQuestion(question, isFollowUp = false) {
  try {
    addChatMessage(question, true);
    addToHistory(question, true);
    showLoading("Processing your question...");

    // Check if we have Excel/CSV data and if analysis is needed
    const hasExcelData =
      extractedData.excel.length > 0 || extractedData.csv.length > 0;

    if (hasExcelData) {
      const needsAnalysis = await needsExcelAnalysis(question);
      if (needsAnalysis) {
        showLoading("Performing data analysis...");

        // Prepare data for analysis
        let analysisData;
        let sheetInfo = "";

        if (extractedData.excel.length > 0) {
          const workbook = extractedData.excel[0].content;
          // Get all sheet names and their first few rows
          const sheets = workbook.SheetNames.map((name) =>
            extractSheetData(workbook, name)
          );

          // Create sheet info for LLM context
          sheetInfo = `Available sheets in Excel file:
${sheets
  .map(
    (sheet) => `
Sheet: ${sheet.name}
Columns: ${sheet.headers.join(", ")}
Sample data (first 5 rows):
${JSON.stringify(sheet.data.slice(0, 5), null, 2)}
`
  )
  .join("\n")}`;

          // Store full data for analysis
          analysisData = sheets.reduce((acc, sheet) => {
            acc[sheet.name] = sheet.data;
            return acc;
          }, {});
        } else {
          // For CSV, use existing logic
          const csvContent = extractedData.csv[0].content;
          const headers = csvContent[0];
          analysisData = {
            Sheet1: csvContent
              .slice(1)
              .map((row) =>
                Object.fromEntries(
                  headers.map((header, i) => [header, row[i]])
                )
              ),
          };
          sheetInfo = `CSV Data:
Columns: ${headers.join(", ")}
Sample data (first 5 rows):
${JSON.stringify(analysisData.Sheet1.slice(0, 5), null, 2)}`;
        }

        const pythonCode = await generatePythonAnalysisCode(question, {
          sheetInfo,
        });

        try {
          const analysisResult = await new Promise((resolve, reject) => {
            const id = Date.now().toString();
            const handler = (e) => {
              if (e.data.id === id) {
                pyodideWorker.removeEventListener("message", handler);
                e.data.error
                  ? reject(new Error(e.data.error))
                  : resolve(e.data.result);
              }
            };
            pyodideWorker.addEventListener("message", handler);
            pyodideWorker.postMessage({
              id,
              code: pythonCode,
              data: analysisData,
              context: {},
            });
          });

          showLoading("Formatting analysis results...");
          // Convert pandas DataFrame result to proper format
          let tableData = null;
          if (analysisResult && typeof analysisResult === 'object') {
            if (analysisResult.values && analysisResult.columns) {
              // Handle pandas DataFrame format
              tableData = analysisResult.values.map(row => 
                Object.fromEntries(analysisResult.columns.map((col, i) => [col, row[i]]))
              );
            } else if (Array.isArray(analysisResult)) {
              // Handle array of objects
              tableData = analysisResult;
            } else {
              // Handle object with array values
              const arrayData = Object.values(analysisResult).find(value => Array.isArray(value));
              if (arrayData) {
                if (arrayData[0] && typeof arrayData[0] === 'object') {
                  // Array of objects
                  tableData = arrayData;
                } else if (Object.keys(analysisResult)[0]) {
                  // Convert array of arrays to array of objects
                  const headers = Object.keys(analysisResult)[0].split(',');
                  tableData = arrayData.map(row => 
                    Object.fromEntries(headers.map((header, i) => [header.trim(), row[i]]))
                  );
                }
              } else {
                // Try to convert the entire result to array of objects
                if (typeof analysisResult === 'object' && !Array.isArray(analysisResult)) {
                  tableData = [analysisResult];
                }
              }
            }
          }

          // Store the properly formatted data for download
          if (tableData && Array.isArray(tableData) && tableData.length > 0) {
            currentAnalysisData = tableData;
            // Format the results using LLM
            const formattedAnalysis = await formatAnalysisResult(
              analysisResult,
              question
            );

            const formattedResult = `
\`\`\`python
${pythonCode}
\`\`\`

${formattedAnalysis}`;

            addToHistory(formattedAnalysis, false);
            await addAnalysisResult(formattedResult, null, isFollowUp);
          } else {
            currentAnalysisData = null;
          }
          
          hideLoading();
          return;
        } catch (error) {
          console.error("Analysis failed:", error);
          hideLoading();
          const errorMessage =
            "Sorry, there was an error analyzing the data: " + error.message;
          addChatMessage(errorMessage, false);
          addToHistory(errorMessage, false);
          return;
        }
      }
    }
    // Regular expert consultation flow if no Excel analysis needed
    let expertsData = !isFollowUp ? [] : currentExpertsData;
    if (!isFollowUp) {
      const experts = await getExperts(question);
      for (const [i, expert] of experts.entries()) {
        expert.name ||= `Expert ${i + 1}`;
        const qs = await generateExpertQuestions(question, expert);
        const as = await getExpertAnswers(question, expert, qs);
        const qa = qs.map((q, idx) => ({ question: q, answer: as[idx] }));
        const summary = await generateExpertSummary(question, expert, qa);
        expertsData.push({
          ...expert,
          questions: qs,
          answers: as,
          summary,
          questionsAndAnswers: qa,
        });
      }
      currentExpertsData = expertsData;
    } else {
      for (const expert of expertsData) {
        const qs = await generateExpertQuestions(question, expert);
        const as = await getExpertAnswers(question, expert, qs);
        const qa = qs.map((q, idx) => ({ question: q, answer: as[idx] }));
        expert.questions = [...expert.questions, ...qs];
        expert.answers = [...expert.answers, ...as];
        expert.questionsAndAnswers = [...expert.questionsAndAnswers, ...qa];
        expert.summary = await generateExpertSummary(
          question,
          expert,
          expert.questionsAndAnswers
        );
      }
    }
    const finalAnswer = await generateFinalAnswer(question, expertsData);
    addToHistory(finalAnswer, false);
    for (const expert of expertsData) {
      expert.mermaid = await generateExpertMindmapWithLLM(
        question,
        expert,
        expert.questionsAndAnswers,
        finalAnswer
      );
    }
    hideLoading();
    await addAnalysisResult(finalAnswer, expertsData, isFollowUp);
  } catch (error) {
    hideLoading();
    showError(error.message);
  }
}

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  mindmap: {
    padding: 10,
    useMaxWidth: true
  },
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis'
  }
});

// Function to check if question needs Excel analysis
async function needsExcelAnalysis(question) {
  const systemPrompt = `You are an assistant that determines if a question requires Excel/CSV data operations.
  Answer with ONLY "yes" or "no". 
  
  Answer "yes" if the question involves ANY of:
  - Data extraction 
  - Data filtering 
  - Data grouping 
  - Data calculations 

  Otherwise, answer "no".`;

  const userMessage = `Question: ${question}
  Does this question require Excel/CSV data operations? Answer only yes/no.`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    return response.toLowerCase().includes("yes");
  } catch (error) {
    console.error("Failed to check if analysis needed:", error);
    return false;
  }
}

// Function to generate Python code for Excel analysis
async function generatePythonAnalysisCode(question, data) {
  const systemPrompt = `You are a Python code generator specialized in data extraction from Excel/CSV files.
  Generate a Python function that extracts data using pandas.
  
  CRITICAL: The function must:
  1. Extract specific rows/data based on the question
  2. Return results in a FLAT dictionary where:
     - Keys are same as column names provided as reference or descriptive of what was extracted
     - Values can be the actual data (numbers or strings)
     - NO nested structures or arrays
    

  Function requirements:
  1. Name: generateAnalysis
  2. Input: Dictionary of pandas DataFrames
  3. Use pandas operations 
  4. Handle missing data and errors

  Function template:
  \`\`\`python
  import pandas as pd
  import numpy as np
  from typing import Dict
  
  def generateAnalysis(dfs: Dict[str, pd.DataFrame]) -> dict:
      """
      Extract and filter data from DataFrames based on the question.
      Returns results as a flat dictionary.
      
      Args:
          dfs: Dictionary of pandas DataFrames
          
      Returns:
          dict: Extracted data as {key: value} pairs
      """
      try:
          result = {}  # Will contain extracted data
          return result
      except Exception as e:
          return {"error": "1"}
  \`\`\`
  
  Dataset structure:
  ${data.sheetInfo}`;

  const userMessage = `Question: ${question}
  Generate the generateAnalysis function to analyze this data.
  IMPORTANT:
  1. Follow the exact function template
  2. Convert all numpy/pandas numeric types to native Python types using float(), int()
  3. Return only JSON-serializable values in the dictionary
  4. Handle all errors inside the function
  5. Make sure to handle multiple sheets appropriately`;

  try {
    const response = await callOpenAI(systemPrompt, userMessage);
    const codeMatch = response.match(/```python\n([\s\S]*?)```/);
    let pythonCode = codeMatch ? codeMatch[1].trim() : response.trim();

    // Ensure all required imports are present
    const requiredImports = [
      "import pandas as pd",
      "import numpy as np",
      "from typing import Dict",
    ];

    const missingImports = requiredImports.filter(
      (imp) => !pythonCode.includes(imp)
    );
    if (missingImports.length > 0) {
      pythonCode = missingImports.join("\n") + "\n\n" + pythonCode;
    }

    // Add the function call
    pythonCode += "\n\n# Convert input data to DataFrames\n";
    pythonCode +=
      "sheet_dfs = {name: pd.DataFrame(data) for name, data in data.items()}\n";
    pythonCode += "# Execute analysis\ngenerateAnalysis(sheet_dfs)";
    return pythonCode;
  } catch (error) {
    console.error("Failed to generate Python code:", error);
    throw error;
  }
}

// Function to extract data from Excel/CSV files
function extractSheetData(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: "A",
    raw: true,
    blankrows: false,
  });
  const headers = Object.values(rows[0]);
  return {
    name: sheetName,
    headers,
    data: rows
      .slice(1)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([_, v], i) => [headers[i], v])
        )
      ),
  };
}

// Function to format analysis results using LLM
async function formatAnalysisResult(analysisResult, question) {
  const systemPrompt = `You are a data analysis formatter that converts JSON analysis results into clear, readable markdown format.
  Your task is to explain the analysis results in the context of the user's question.
  
  Guidelines:
  1. Start with a brief restatement of the user's question
  2. Create clear section headers for each metric/analysis
  3. Format numbers with appropriate precision
  4. Use bullet points for lists
  5. Create tables when appropriate
  6. Add brief explanations for the results that directly address the user's question
  7. Highlight important findings
  8. Use proper markdown formatting
  9. End with a concise conclusion that answers the original question
  
  Example format:
  
  ### Summary
  Brief explanation of how the analysis answers the question.
  
  ### Key Findings
  * Finding 1: [value] - explanation
  * Finding 2: [value] - explanation
  
  ### Detailed Results
  [Relevant metrics and explanations]
  
  ### Conclusion
  Direct answer to the user's question based on the analysis.`;

  const userMessage = `User Question: "${question}"

Analysis Results:
${JSON.stringify(analysisResult, null, 2)}

Please format these results in a clear markdown format that directly addresses the user's question.`;

  try {
    const formattedResponse = await callOpenAI(systemPrompt, userMessage);
    return formattedResponse;
  } catch (error) {
    console.error("Failed to format analysis result:", error);
    // Fallback to basic formatting if LLM fails
    return `## Analysis Results for: "${question}"\n${JSON.stringify(
      analysisResult,
      null,
      2
    )}`;
  }
}

// Function to download as CSV
function downloadCsv() {
  if (!currentAnalysisData) return;
  
  const headers = Object.keys(currentAnalysisData[0]);
  const csvContent = [
    headers.join(','),
    ...currentAnalysisData.map(row => 
      headers.map(header => 
        JSON.stringify(row[header] || '')
      ).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'analysis_result.csv';
  link.click();
}

// Function to download as XLSX
function downloadXlsx() {
  if (!currentAnalysisData) return;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(currentAnalysisData);
  XLSX.utils.book_append_sheet(wb, ws, 'Analysis Result');
  XLSX.writeFile(wb, 'analysis_result.xlsx');
}

// Generate a related question based on node text and original question
async function generateRelatedQuestion(nodeText, originalQuestion) {
  const systemPrompt = `You are an expert at generating insightful follow-up questions.
Given a node text from a mindmap and the original question that generated it, create ONE specific follow-up question that:
1. Explores the topic of the node text in more detail
2. Relates back to the original question's context
3. Is clear, concise, and focused
4. Helps gain deeper insights

Return ONLY the question as a plain string, no JSON or other formatting.`;

  const userMessage = `Original Question: "${originalQuestion}"
Node Text: "${nodeText}"

Generate a follow-up question that explores this specific aspect in more detail.`;

  try {
    const question = await callOpenAI(systemPrompt, userMessage);
    return question.trim();
  } catch (error) {
    console.error('Error generating related question:', error);
    throw new Error('Failed to generate a related question');
  }
}

function handleContainerClick(e) {
  if (e.target.tagName === 'JMNODE') {
    const nodeText = e.target.textContent;

    if(!nodeText) {
      console.error('No node text available');
      return;
    }

    if (!currentQuestion) {
      showError('No current question context available');
      return;
    }

    generateRelatedQuestion(nodeText, currentQuestion)
      .then(question => {
        if (question) {
          processQuestion(question, false);
        }
      })
      .catch(error => {
        showError(error.message);
      });
  }
}

container.addEventListener('dblclick', handleContainerClick);

// Add event listeners for download buttons
downloadCsvBtn.addEventListener('click', downloadCsv);
downloadXlsxBtn.addEventListener('click', downloadXlsx);

// Make processQuestion globally accessible
window.processQuestion = async (question) => {
  try {
    const questionInput = document.getElementById("questionInput");
    questionInput.value = '';
    
    // Clear any previous error states
    questionInput.classList.remove('is-invalid');
    
    // Disable input and show loading state
    questionInput.disabled = true;
    showLoading("Processing your question...");
    
    await processQuestion(question, false);
  } catch (error) {
    console.error('Error processing question:', error);
    showError('Failed to process question');
  } finally {
    // Re-enable input
    questionInput.disabled = false;
    hideLoading();
  }
};

// Function to generate initial summary and questions
async function generateInitialInsights() {
  const systemPrompt = `
    You are assisting a Clinical Development Director in analyzing uploaded documents.
    Based on the provided documents, create:
    1. A brief summary of the uploaded files
    2. 3 relevant questions that would help analyze the data from a clinical development perspective
    
    Focus on aspects like:
    - Clinical trial data and outcomes
    - Safety and efficacy metrics
    - Patient demographics and subgroups
    - Protocol compliance
    - Statistical significance
    
    Return in this JSON format:
    {
      "summary": "Brief summary of the documents",
      "questions": [
        "Question 1?",
        "Question 2?",
        "Question 3?"
      ]
    }`;

  const documentContext = `
    Available document content:
    ${extractedData.pdfs.map(pdf => `PDF: ${pdf.filename}\nContent: ${pdf.content}`).join('\n\n')}
    ${extractedData.excel.map(excel => `Excel: ${excel.filename}\nContent: ${JSON.stringify(excel.content)}`).join('\n\n')}
    ${extractedData.csv.map(csv => `CSV: ${csv.filename}\nContent: ${JSON.stringify(csv.content)}`).join('\n\n')}
    ${extractedData.docx.map(docx => `DOCX: ${docx.filename}\nContent: ${docx.content}`).join('\n\n')}
  `;

  try {
    const response = await callOpenAI(systemPrompt, documentContext);
    const result = JSON.parse(response);
    
    // Create and append the insight card to chat container
    const card = document.createElement('div');
    card.className = 'chat-message system-message mb-3';
    
    const content = `
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Document Analysis Summary</h5>
          <p class="card-text">${result.summary}</p>
          <h6 class="card-subtitle mb-2 mt-3">Suggested Questions:</h6>
          <div class="suggested-questions">
            ${result.questions.map(q => `
              <div class="suggested-question mb-2">
                <a href="#" class="text-primary" onclick="window.processQuestion('${q.replace(/'/g, "\\'")}'); return false;">
                  <i class="bi bi-question-circle me-2"></i>${q}
                </a>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    card.innerHTML = content;
    chatContainer.appendChild(card);
    
  } catch (error) {
    console.error('Failed to generate initial insights:', error);
    showError('Failed to analyze uploaded documents');
  }
}