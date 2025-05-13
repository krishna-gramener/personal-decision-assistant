import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm"
import { openai_url, gemini_url, token, setupAPI} from './api-config.js';
import { initializeMindmap, generateFinalmapData, generateExpertMindmapWithLLM, updateMindmapData, updateCurrentQuestion } from './mindmap-handlers.js';
import { getExperts, generateExpertQuestions, getExpertAnswers, generateExpertSummary, generateFinalAnswer, updateExpertsData } from './experts.js';

// Initialize mindmap handlers once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeMindmap({
        container: document.getElementById('jsmind_container'),
        viewMindmapBtn: document.getElementById('viewMindmapBtn'),
        mindmapModal: document.getElementById('mindmapModal')
    });
});
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
const downloadCsvBtn = document.getElementById("downloadCsv");
const downloadXlsxBtn = document.getElementById("downloadXlsx");
const mainContent = document.getElementById('mainContent');
const apiForm = document.getElementById('apiForm');
let currentAnalysisData = null;
let currentQuestion = null;

let sheetData=[];
// Store conversation history
let conversationHistory = [];

// Store extracted data from files
let extractedData = {
  pdfs: [],
  excel: [],
  csv: [],
  docx: [],
};


// Initialize API configuration
setupAPI(apiForm, mainContent);

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

// Function to format extracted data from all file types
function formatExtractedData() {
    const fileTypes = {
        pdfs: { prefix: 'PDF', needsStringify: false },
        excel: { prefix: 'Excel', needsStringify: true },
        csv: { prefix: 'CSV', needsStringify: true },
        docx: { prefix: 'DOCX', needsStringify: false }
    };

    return Object.entries(fileTypes)
        .map(([type, { prefix, needsStringify }]) => {
            return extractedData[type]
                .map(file => {
                    const content = needsStringify ? JSON.stringify(file.content) : file.content;
                    return `${prefix}: ${file.filename}\nContent: ${content}`;
                })
                .join('\n\n');
        })
        .join('\n\n');
}

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
        Authorization: `Bearer ${token}`,
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
        Authorization: `Bearer ${token}`,
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

async function addAnalysisResult(finalAnswer, expertsData) {
  try {
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
      const mindmapData = await generateFinalmapData(
        expertsData[0].question,
        expertsData
      );
      updateMindmapData(mindmapData);
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

    if (conversationHistory.length >= 2) {
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
    if (conversationHistory.length >= 2) {
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
  updateCurrentQuestion(question);
  processQuestion(question, false); // Pass false to indicate it's a new question
});

// Process the question
 async function processQuestion(question, isFollowup = false) {
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
            await addAnalysisResult(formattedResult, null);
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
    const experts = await getExperts(question);
    let expertsData = [];
    for (const [i, expert] of experts.entries()) {
      expert.name ||= `Expert ${i + 1}`;
      const qs = await generateExpertQuestions(question, expert);
      const as = await getExpertAnswers(question, expert, qs);
      const qa = qs.map((q, idx) => ({ question: q, answer: as[idx] }));
      const summary = await generateExpertSummary(question, expert, qa);
      const mermaid = await generateExpertMindmapWithLLM(
        question,
        expert,
        qa,
        summary
      );
      expertsData.push({
        ...expert,
        questions: qs,
        answers: as,
        summary,
        questionsAndAnswers: qa,
        mermaid
      });
    }

    // Update experts data state
    updateExpertsData(expertsData);

    // Generate final answer
    const finalAnswer = await generateFinalAnswer(question, expertsData);

    // Generate mindmap data
    const mindmapData = await generateFinalmapData(question, expertsData);
    updateMindmapData(mindmapData);

    // Add analysis result to UI
    await addAnalysisResult(finalAnswer, expertsData);

    // Generate follow-up questions
    const followUpQuestions = await generateFollowUpQuestions(
      question,
      finalAnswer
    );
    addFollowUpQuestions(followUpQuestions);

    // Hide loading state
    hideLoading();
  } catch (error) {
    hideLoading();
    showError(error.message);
  }
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
    ${formatExtractedData()}
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

// Export only functions needed by other modules
export {
  showLoading,
  hideLoading,
  showError,
  callOpenAI,
  formatExtractedData,
  getConversationContext,
  generateRelatedQuestion,
  processQuestion
};